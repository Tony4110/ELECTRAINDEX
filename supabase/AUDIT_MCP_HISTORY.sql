-- AUDIT_MCP_HISTORY.sql — READ ONLY. Changes nothing in the database.
-- What our MCP history really contains: depth, check frequency, statuses,
-- tool observations and use-case classification. One table of results.

with
h30 as (select entity_id, checked_at, status from mcp_live_history where checked_at > now() - interval '30 days'),
gaps as (
  select extract(epoch from checked_at - lag(checked_at) over (partition by entity_id order by checked_at)) / 3600.0 as hrs
    from h30
),
per_srv as (select entity_id, count(*) as n from h30 group by entity_id),
age as (select entity_id, min(checked_at) as first_at from mcp_live_history group by entity_id),
last_list as (select entity_id, checked_at from mcp_live_status where status = 'online' and coalesce(tools_more, false) = false and coalesce(tool_count, 0) between 1 and 100)
select * from (
  select 1 as ord, 'history' as section, 'first check ever' as metric, min(checked_at)::text as value from mcp_live_history
  union all select 2, 'history', 'total checks kept', count(*)::text from mcp_live_history
  union all select 3, 'history', 'checks last 24 h', count(*)::text from mcp_live_history where checked_at > now() - interval '1 day'
  union all select 4, 'history', 'checks per day (7-day average)', round(count(*) / 7.0)::text from mcp_live_history where checked_at > now() - interval '7 days'
  union all select 5, 'frequency', 'servers checked in last 30 days', count(*)::text from per_srv
  union all select 6, 'frequency', 'median hours between two checks', round(percentile_cont(0.5) within group (order by hrs)::numeric, 1)::text from gaps where hrs is not null
  union all select 7, 'frequency', 'p90 hours between two checks', round(percentile_cont(0.9) within group (order by hrs)::numeric, 1)::text from gaps where hrs is not null
  union all select 8, 'frequency', 'median checks per server (30 days)', percentile_cont(0.5) within group (order by n)::text from per_srv
  union all select 9, 'frequency', 'servers with 10+ checks (30 days)', count(*)::text from per_srv where n >= 10
  union all select 10, 'depth', 'servers watched for 30+ days', count(*)::text from age where first_at < now() - interval '30 days'
  union all select 11, 'depth', 'servers watched for 90+ days', count(*)::text from age where first_at < now() - interval '90 days'
  union all select 12, 'status 30d', 'online', count(*)::text from h30 where status = 'online'
  union all select 13, 'status 30d', 'auth_required (key or sign-in)', count(*)::text from h30 where status = 'auth_required'
  union all select 14, 'status 30d', 'down', count(*)::text from h30 where status = 'down'
  union all select 15, 'status 30d', 'other statuses', count(*)::text from h30 where status not in ('online', 'auth_required', 'down')
  union all select 16, 'tools', 'tools recorded', count(*)::text from mcp_tools
  union all select 17, 'tools', 'tool records started on', min(first_seen_at)::text from mcp_tools
  union all select 18, 'tools', 'tools first seen after day one', count(*)::text from mcp_tools where first_seen_at > (select min(first_seen_at) + interval '1 day' from mcp_tools)
  union all select 19, 'tools', 'tools no longer listed (complete lists only)', count(*)::text
              from mcp_tools t join last_list l using (entity_id) where t.last_seen_at < l.checked_at - interval '1 day'
  union all select 20, 'tools', 'servers whose list is cut (over 100 tools or paged)', count(*)::text
              from mcp_live_status where status = 'online' and (coalesce(tools_more, false) or coalesce(tool_count, 0) > 100)
  union all select 21, 'changes', 'version changes recorded', count(*)::text from change_events where event_type = 'new_version'
  union all select 22, 'use cases', 'capabilities with tools', count(*)::text from v_capability_overview where tools > 0
) r order by ord;
