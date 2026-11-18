-- MONITOR_ROBOT_STEP1.sql — READ ONLY. Changes nothing.
-- Robot step 1: the 48 hours before the change compared with the time since the change (per day).
-- "sent" = requests the robot sent; "checks" = results actually recorded in the history.

with
t as (select max(changed_at) as t0 from robot_settings_log where label = 'step 1'),
p as (
  select 'before' as period, t0 - interval '48 hours' as a, t0 as b from t
  union all select 'after', t0, now() from t
),
d as (select period, a, b, greatest(extract(epoch from b - a) / 86400.0, 0.01) as days from p),
srv as (select e.id, host_of(live_check_url(e.id)) as host from entities e where e.type = 'mcp_server' and e.is_published and live_check_url(e.id) is not null),
big as (select host from srv group by host having count(*) >= 100),
g as (   -- hours since the previous check of the same server, for each check of the period
  select d.period, h.entity_id, h.status, h.http,
         extract(epoch from h.checked_at - (select max(x.checked_at) from mcp_live_history x where x.entity_id = h.entity_id and x.checked_at < h.checked_at)) / 3600.0 as gap
    from d join mcp_live_history h on h.checked_at >= d.a and h.checked_at < d.b
),
cov as (
  select entity_id, count(*) filter (where mcp_check_class(status, http) <> 'excluded') as n
    from mcp_live_history where checked_at > now() - interval '30 days' group by entity_id
)
select * from (
  select 0 as ord, 'settings' as indicator, 'step 1 applied at' as before, (select t0::text from t) as after
  union all
  select 1, '1. lost requests (per day)',
         (select round(count(*) / d.days)::text from d, mcp_live_checks c where d.period = 'before' and c.phase = 'init' and not c.applied and c.dispatched_at >= d.a and c.dispatched_at < d.b group by d.days),
         (select round(count(*) / d.days)::text from d, mcp_live_checks c where d.period = 'after' and c.phase = 'init' and not c.applied and c.dispatched_at >= d.a and c.dispatched_at < least(d.b, now() - interval '1 hour') group by d.days)
  union all
  select 2, '2. timeouts, % of checks',
         (select round(100.0 * count(*) filter (where status = 'timeout') / nullif(count(*), 0), 2)::text from g where period = 'before'),
         (select round(100.0 * count(*) filter (where status = 'timeout') / nullif(count(*), 0), 2)::text from g where period = 'after')
  union all
  select 3, '3. failures, % of conclusive checks (rule B)',
         (select round(100.0 * count(*) filter (where mcp_check_class(status, http) = 'failure') / nullif(count(*) filter (where mcp_check_class(status, http) <> 'excluded'), 0), 2)::text from g where period = 'before'),
         (select round(100.0 * count(*) filter (where mcp_check_class(status, http) = 'failure') / nullif(count(*) filter (where mcp_check_class(status, http) <> 'excluded'), 0), 2)::text from g where period = 'after')
  union all
  select 4, '4a. requests sent per day',
         (select round(count(*) / d.days)::text from d, mcp_live_checks c where d.period = 'before' and c.phase = 'init' and c.dispatched_at >= d.a and c.dispatched_at < d.b group by d.days),
         (select round(count(*) / d.days)::text from d, mcp_live_checks c where d.period = 'after' and c.phase = 'init' and c.dispatched_at >= d.a and c.dispatched_at < d.b group by d.days)
  union all
  select 4, '4b. checks recorded per day',
         (select round(count(*) / max(d.days))::text from g join d using (period) where period = 'before'),
         (select round(count(*) / max(d.days))::text from g join d using (period) where period = 'after')
  union all
  select 4, '4c. average servers sent per run',
         (select round(avg(n))::text from (select count(*) as n from d, mcp_live_checks c where d.period = 'before' and c.phase = 'init' and c.dispatched_at >= d.a and c.dispatched_at < d.b group by mcp_window(c.dispatched_at)) r),
         (select round(avg(n))::text from (select count(*) as n from d, mcp_live_checks c where d.period = 'after' and c.phase = 'init' and c.dispatched_at >= d.a and c.dispatched_at < d.b group by mcp_window(c.dispatched_at)) r)
  union all
  select 5, '5. hours between two checks: median / p90',
         (select round(percentile_cont(0.5) within group (order by gap)::numeric) || ' / ' || round(percentile_cont(0.9) within group (order by gap)::numeric) from g where period = 'before' and gap is not null),
         (select round(percentile_cont(0.5) within group (order by gap)::numeric) || ' / ' || round(percentile_cont(0.9) within group (order by gap)::numeric) from g where period = 'after' and gap is not null)
  union all
  select 6, '6. median hours between checks, 5 largest hosts / other hosts',
         (select round(percentile_cont(0.5) within group (order by gap) filter (where s.host in (select host from big))::numeric) || ' / ' || round(percentile_cont(0.5) within group (order by gap) filter (where s.host not in (select host from big))::numeric) from g join srv s on s.id = g.entity_id where period = 'before' and gap is not null),
         (select round(percentile_cont(0.5) within group (order by gap) filter (where s.host in (select host from big))::numeric) || ' / ' || round(percentile_cont(0.5) within group (order by gap) filter (where s.host not in (select host from big))::numeric) from g join srv s on s.id = g.entity_id where period = 'after' and gap is not null)
  union all
  select 7, '7. servers with 10+ conclusive checks in 30 days (count, % of checkable)',
         (select servers_10plus || ' (' || pct_10plus || '%) on ' || day from robot_coverage_daily order by day limit 1),
         (select count(*) filter (where n >= 10) || ' (' || round(100.0 * count(*) filter (where n >= 10) / nullif((select count(*) from srv), 0), 1) || '%) now' from cov)
) r order by ord, indicator;

-- progress over time (one line per day, filled every morning at 04:40 UTC)
-- select * from robot_coverage_daily order by day;
