-- ELECTRA INDEX — INSTALL_RELIABILITY_INDEX (0072) : Electra MCP Reliability Index, daily (validated by Ami Chat on 25 Nov 2026)
--  DAILY (24 h, UTC day) + STABILITY (7 days), each as Global Test Success Rate and Server Reliability Average.
--  Same rule B as the server pages. One value per day, published at 00:30 UTC, insert-only archive.
--  First publication: the days since 24 Oct 2026 (first day with 7 full days of checks) are computed now
--  from the kept history and marked "backfilled".
-- Paste everything in Supabase > SQL Editor > Run (about a minute). Re-runnable.

-- speeds up the daily calculation (reads one week of checks)
create index if not exists idx_mcp_live_history_checked_at on mcp_live_history(checked_at);


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

-- first publication: every finished day since 24 Oct 2026
do $$
declare d date;
begin
  for d in select g::date from generate_series(date '2026-10-24', (now() at time zone 'utc')::date - 1, interval '1 day') g loop
    perform reliability_index_publish(d, true);
  end loop;
end $$;

-- check (nothing is changed by these lines)
select day, d_global as "24h global %", d_server_avg as "24h server avg %", d_checks as "24h checks", d_servers as "24h servers",
       w_global as "7d global %", w_server_avg as "7d server avg %", insufficient
  from reliability_index_daily order by day desc limit 10;
