-- ELECTRA INDEX — 0072 Electra MCP Reliability Index (validated by Ami Chat on 25 Nov 2026)
--  One published value per UTC day, never rewritten:
--   * DAILY (24 h): the UTC day [00:00, 24:00)            -> the news of the day
--   * STABILITY (7 days): the 7 UTC days ending that day   -> the trend
--  For each window, two measures (same rule B as the server pages, incident windows on our side excluded):
--   * Global Test Success Rate  = answers / conclusive checks (every check weighs the same)
--   * Server Reliability Average = mean of each server's own rate (every server weighs the same)
--  Published with the number of checks, answers, failures and servers, and the time of calculation.
--  A value is marked "insufficient" below 1,000 conclusive checks or 500 servers.
--  Archive: rows are insert-only (a trigger refuses updates and deletes). A correction is a new row in
--  reliability_index_corrections that points to the published day, so history is never silently rewritten.

create table if not exists reliability_index_daily (
  day            date primary key,             -- UTC day the values describe
  computed_at    timestamptz not null default now(),
  backfilled     boolean not null default false,   -- computed later from the kept history (first publication)
  -- 24 h
  d_checks       int not null,                 -- conclusive checks
  d_answers      int not null,
  d_failures     int not null,
  d_servers      int not null,
  d_global       numeric(5,2),                 -- Global Test Success Rate, %
  d_server_avg   numeric(5,2),                 -- Server Reliability Average, %
  -- 7 days
  w_checks       int not null,
  w_answers      int not null,
  w_failures     int not null,
  w_servers      int not null,
  w_global       numeric(5,2),
  w_server_avg   numeric(5,2),
  excluded       int not null default 0,       -- inconclusive checks not counted (429, other replies, our incidents), 24 h
  insufficient   boolean not null default false,
  method_version text not null default 'v1'
);
alter table reliability_index_daily enable row level security;
drop policy if exists reliability_index_read on reliability_index_daily;
create policy reliability_index_read on reliability_index_daily for select to anon, authenticated using (true);
grant select on reliability_index_daily to anon, authenticated;

create or replace function reliability_index_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'reliability_index_daily is an archive: add a row to reliability_index_corrections instead';
end $$;
drop trigger if exists trg_reliability_index_immutable on reliability_index_daily;
create trigger trg_reliability_index_immutable before update or delete on reliability_index_daily
  for each row execute function reliability_index_immutable();

create table if not exists reliability_index_corrections (
  id          bigserial primary key,
  day         date not null references reliability_index_daily(day),
  corrected_at timestamptz not null default now(),
  field       text not null,
  old_value   text,
  new_value   text,
  reason      text not null
);
alter table reliability_index_corrections enable row level security;
drop policy if exists reliability_index_corr_read on reliability_index_corrections;
create policy reliability_index_corr_read on reliability_index_corrections for select to anon, authenticated using (true);
grant select on reliability_index_corrections to anon, authenticated;

-- the values for one UTC day (read-only calculation)
create or replace function reliability_index_values(p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_end timestamptz := (p_day + 1)::timestamp at time zone 'utc'; r jsonb;
begin
  with h as (
    select x.entity_id, x.checked_at >= v_end - interval '1 day' as in_day,
           case when exists (select 1 from mcp_check_incidents i where i.window_start = mcp_window(x.checked_at)) then 'excluded'
                else mcp_check_class(x.status, x.http) end as cls
      from mcp_live_history x
     where x.checked_at >= v_end - interval '7 days' and x.checked_at < v_end
  ),
  srv_d as (select entity_id, avg(case when cls in ('open','protected') then 100.0 else 0 end) as rate
              from h where in_day and cls <> 'excluded' group by entity_id),
  srv_w as (select entity_id, avg(case when cls in ('open','protected') then 100.0 else 0 end) as rate
              from h where cls <> 'excluded' group by entity_id)
  select jsonb_build_object(
    'd_checks',   (select count(*) from h where in_day and cls <> 'excluded'),
    'd_answers',  (select count(*) from h where in_day and cls in ('open','protected')),
    'd_failures', (select count(*) from h where in_day and cls = 'failure'),
    'd_servers',  (select count(*) from srv_d),
    'd_server_avg', (select round(avg(rate), 2) from srv_d),
    'w_checks',   (select count(*) from h where cls <> 'excluded'),
    'w_answers',  (select count(*) from h where cls in ('open','protected')),
    'w_failures', (select count(*) from h where cls = 'failure'),
    'w_servers',  (select count(*) from srv_w),
    'w_server_avg', (select round(avg(rate), 2) from srv_w),
    'excluded',   (select count(*) from h where in_day and cls = 'excluded'))
  into r;
  return r || jsonb_build_object(
    'd_global', round(100.0 * (r->>'d_answers')::numeric / nullif((r->>'d_checks')::numeric, 0), 2),
    'w_global', round(100.0 * (r->>'w_answers')::numeric / nullif((r->>'w_checks')::numeric, 0), 2));
end $$;
revoke execute on function reliability_index_values(date) from public, anon, authenticated;

-- publish one day (once; a day already published is left as it is)
create or replace function reliability_index_publish(p_day date default (now() at time zone 'utc')::date - 1, p_backfilled boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if p_day >= (now() at time zone 'utc')::date then return 'day not finished'; end if;
  if exists (select 1 from reliability_index_daily where day = p_day) then return 'already published'; end if;
  v := reliability_index_values(p_day);
  if (v->>'d_checks')::int = 0 then return 'no checks'; end if;
  insert into reliability_index_daily(day, backfilled, d_checks, d_answers, d_failures, d_servers, d_global, d_server_avg,
                                      w_checks, w_answers, w_failures, w_servers, w_global, w_server_avg, excluded, insufficient)
  values (p_day, p_backfilled,
          (v->>'d_checks')::int, (v->>'d_answers')::int, (v->>'d_failures')::int, (v->>'d_servers')::int,
          (v->>'d_global')::numeric, (v->>'d_server_avg')::numeric,
          (v->>'w_checks')::int, (v->>'w_answers')::int, (v->>'w_failures')::int, (v->>'w_servers')::int,
          (v->>'w_global')::numeric, (v->>'w_server_avg')::numeric, (v->>'excluded')::int,
          (v->>'d_checks')::int < 1000 or (v->>'d_servers')::int < 500);
  return 'published';
end $$;
revoke execute on function reliability_index_publish(date, boolean) from public, anon, authenticated;

-- every day at 00:30 UTC, the day that just ended
select cron.unschedule(jobid) from cron.job where jobname = 'electra-reliability-index';
select cron.schedule('electra-reliability-index', '30 0 * * *', $job$ select reliability_index_publish(); $job$);
