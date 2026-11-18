-- CHECK_ROBOT_CAPACITY.sql — READ ONLY. Changes nothing.
-- Why the robot runs about 10,500 checks a day instead of the theoretical 14,400 (300 every 30 minutes).
-- The robot only picks a server once its last check is 3 days old, and at most 3 servers per host per run.

with
srv as (   -- servers the robot can check (hosted endpoint, same rule as the robot)
  select e.id, host_of(live_check_url(e.id)) as host, s.checked_at
    from entities e left join mcp_live_status s on s.entity_id = e.id
   where e.type = 'mcp_server' and e.is_published and live_check_url(e.id) is not null
),
hosts as (select host, count(*) as n from srv group by host),
runs as (  -- what each robot run actually sent, last 7 days
  select mcp_window(dispatched_at) as w, count(*) as n
    from mcp_live_checks where phase = 'init' and dispatched_at > now() - interval '7 days' group by 1
)
select * from (
  select 1 as ord, 'servers' as section, 'servers the robot can check' as metric, count(*)::text as value from srv
  union all select 2, 'servers', 'due now (last check 3+ days ago or never)', count(*)::text from srv where checked_at is null or checked_at < now() - interval '3 days'
  union all select 3, 'servers', 'hosts', count(*)::text from hosts
  union all select 4, 'servers', 'servers on hosts with 100+ servers', coalesce(sum(n), 0)::text from hosts where n >= 100
  union all select 5, 'runs (7 days)', 'robot runs seen', count(*)::text from runs
  union all select 6, 'runs (7 days)', 'average servers sent per run (max 300)', round(avg(n))::text from runs
  union all select 7, 'runs (7 days)', 'runs that sent the full 300', count(*)::text from runs where n >= 300
  union all select 8, 'runs (7 days)', 'runs that sent fewer than 100', count(*)::text from runs where n < 100
  union all select 9, 'requests (7 days)', 'first requests sent', count(*)::text from mcp_live_checks where phase = 'init' and dispatched_at > now() - interval '7 days'
  union all select 10, 'requests (7 days)', 'first requests never answered (lost)', count(*)::text from mcp_live_checks where phase = 'init' and not applied and dispatched_at between now() - interval '7 days' and now() - interval '1 hour'
  union all select 11, 'history', 'checks recorded, last 24 h', count(*)::text from mcp_live_history where checked_at > now() - interval '1 day'
  union all select 12, 'history', 'checks recorded, 24-48 h ago', count(*)::text from mcp_live_history where checked_at between now() - interval '2 days' and now() - interval '1 day'
  union all select 13, 'history', 'checks recorded, 48-72 h ago', count(*)::text from mcp_live_history where checked_at between now() - interval '3 days' and now() - interval '2 days'
  union all select 20, 'largest hosts', host, n::text from (select host, n from hosts order by n desc limit 5) h
) r order by ord, lpad(value, 12, '0') desc;
