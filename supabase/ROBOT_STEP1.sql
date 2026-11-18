-- ELECTRA INDEX — ROBOT_STEP1 : re-test each hosted MCP server about every 2 days instead of 3
--  Why (CHECK_ROBOT_CAPACITY, 18 Nov 2026): the robot is not short of capacity. It stops because only servers
--  last tested 3+ days ago may be picked (73 of 336 runs sent fewer than 100 servers; 0 request lost).
--  Step 1 (validated 18 Nov 2026): re-test allowed after 2 days (was 3), up to 450 servers per run (was 300).
--  Unchanged: at most 3 servers per host per run (politeness), same 15 s timeout, same requests.
--  Also: a log of robot settings (before / after) and a daily coverage snapshot, to follow progress over time.
--  Follow for 48 h with MONITOR_ROBOT_STEP1.sql. Undo: see the end of this file.
-- Paste everything in Supabase > SQL Editor > Run. Run it once.

-- 1. settings log (traceability)
create table if not exists robot_settings_log (
  id         bigserial primary key,
  changed_at timestamptz not null default now(),
  label      text not null,
  settings   jsonb not null
);
alter table robot_settings_log enable row level security;   -- private

-- 2. daily coverage snapshot: how many servers have enough checks to show a reliability figure
create table if not exists robot_coverage_daily (
  day                 date primary key,
  computed_at         timestamptz not null default now(),
  servers_checkable   int,
  servers_checked_30d int,
  servers_10plus      int,
  pct_10plus          numeric,
  median_gap_hours    numeric,
  p90_gap_hours       numeric,
  checks_24h          int
);
alter table robot_coverage_daily enable row level security;   -- private

create or replace function robot_coverage_snapshot() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r robot_coverage_daily;
begin
  with srv as (
    select e.id from entities e where e.type = 'mcp_server' and e.is_published and live_check_url(e.id) is not null
  ), h as (
    select entity_id, checked_at, mcp_check_class(status, http) as cls,
           extract(epoch from checked_at - lag(checked_at) over (partition by entity_id order by checked_at)) / 3600.0 as gap
      from mcp_live_history where checked_at > now() - interval '30 days'
  ), per as (
    select entity_id, count(*) filter (where cls <> 'excluded') as n from h group by entity_id
  )
  select current_date, now(),
         (select count(*) from srv),
         (select count(*) from per),
         (select count(*) from per where n >= 10),
         round(100.0 * (select count(*) from per where n >= 10) / nullif((select count(*) from srv), 0), 1),
         (select round(percentile_cont(0.5) within group (order by gap)::numeric, 1) from h where gap is not null and checked_at > now() - interval '2 days'),
         (select round(percentile_cont(0.9) within group (order by gap)::numeric, 1) from h where gap is not null and checked_at > now() - interval '2 days'),
         (select count(*) from h where checked_at > now() - interval '1 day')
    into r;
  insert into robot_coverage_daily select (r).*
  on conflict (day) do update set computed_at = excluded.computed_at, servers_checkable = excluded.servers_checkable,
    servers_checked_30d = excluded.servers_checked_30d, servers_10plus = excluded.servers_10plus, pct_10plus = excluded.pct_10plus,
    median_gap_hours = excluded.median_gap_hours, p90_gap_hours = excluded.p90_gap_hours, checks_24h = excluded.checks_24h;
  return to_jsonb(r);
end $$;
revoke execute on function robot_coverage_snapshot() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'electra-robot-coverage';
select cron.schedule('electra-robot-coverage', '40 4 * * *', $job$ select robot_coverage_snapshot(); $job$);

-- 3. baseline before the change
select robot_coverage_snapshot();
insert into robot_settings_log(label, settings)
select 'before step 1', jsonb_build_object('batch', 300, 'min_days_between_checks', 3, 'max_per_host_per_run', 3,
                                           'cron', (select command from cron.job where jobname = 'electra-live-check-dispatch'));

-- 4. the change
select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-dispatch';
select cron.schedule('electra-live-check-dispatch', '5,35 * * * *', $job$ select live_check_dispatch(450, interval '2 days'); $job$);
insert into robot_settings_log(label, settings)
select 'step 1', jsonb_build_object('batch', 450, 'min_days_between_checks', 2, 'max_per_host_per_run', 3,
                                    'cron', (select command from cron.job where jobname = 'electra-live-check-dispatch'));

-- 5. check
select changed_at, label, settings from robot_settings_log order by id;

-- UNDO (back to every 3 days, 300 per run): run only these lines
-- select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-dispatch';
-- select cron.schedule('electra-live-check-dispatch', '5,35 * * * *', $job$ select live_check_dispatch(300); $job$);
-- insert into robot_settings_log(label, settings) values ('undo step 1', '{"batch": 300, "min_days_between_checks": 3, "max_per_host_per_run": 3}');
