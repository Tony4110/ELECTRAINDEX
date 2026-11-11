-- ELECTRA INDEX — REPORT_DATA_STORY : headline numbers for a public "State of MCP & AI agents" report (read only, changes nothing)
-- Paste in Supabase > SQL Editor > Run, then send the table to Claude.
with
mcp as (select e.id, e.first_seen_at, (e.attributes->'mcp.remotes') is not null as remote
          from entities e where e.type = 'mcp_server' and e.is_published),
live as (select s.* from mcp_live_status s join mcp m on m.id = s.entity_id),
agent_min as (select cp.entity_id, min(case when cp.interval = 'year' then cp.amount / 12 else cp.amount end) as usd_month
                from v_current_prices cp join entities e on e.id = cp.entity_id and e.type = 'agent' and e.is_published
               where cp.currency = 'USD' and cp.amount > 0 and cp.interval in ('month','year') group by cp.entity_id),
agent_free as (select distinct cp.entity_id from v_current_prices cp join entities e on e.id = cp.entity_id and e.type = 'agent' and e.is_published
                where cp.billing_model = 'free' or cp.amount = 0)
select 1 as n, 'MCP servers indexed' as metric, (select count(*) from mcp)::text as value
union all select 2, 'MCP servers with a remote (hosted) endpoint', (select count(*) from mcp where remote)::text
union all select 3, 'Hosted MCP servers tested live by our robot', (select count(*) from live)::text
union all select 4, '… answering and listing tools (online)', (select count(*) from live where status = 'online' and coalesce(tool_count,0) > 0)::text
union all select 5, '… asking for a key (auth required)', (select count(*) from live where status = 'auth_required')::text
union all select 6, '… not answering', (select count(*) from live where status not in ('online','auth_required'))::text
union all select 7, 'Tools exposed by online servers (total)', (select coalesce(sum(tool_count),0) from live where status = 'online')::text
union all select 8, 'Median tools per online server', (select percentile_cont(0.5) within group (order by tool_count) from live where status = 'online' and tool_count > 0)::text
union all select 9, 'New MCP servers, last 30 days', (select count(*) from mcp where first_seen_at > now() - interval '30 days')::text
union all select 10, 'New MCP servers, previous 30 days', (select count(*) from mcp where first_seen_at between now() - interval '60 days' and now() - interval '30 days')::text
union all select 11, 'AI agents listed', (select count(*) from entities where type = 'agent' and is_published)::text
union all select 12, 'Agents with a public paid price', (select count(*) from agent_min)::text
union all select 13, 'Agents with a free plan', (select count(*) from agent_free)::text
union all select 14, 'Median entry price of agents (USD / month)', (select round(percentile_cont(0.5) within group (order by usd_month)::numeric, 2) from agent_min)::text
union all select 15, 'Agent price increases, last 90 days', (select count(*) from change_events c join entities e on e.id = c.entity_id and e.type = 'agent' where c.event_type = 'price_increase' and c.detected_at > now() - interval '90 days')::text
union all select 16, 'Agent price decreases, last 90 days', (select count(*) from change_events c join entities e on e.id = c.entity_id and e.type = 'agent' where c.event_type = 'price_decrease' and c.detected_at > now() - interval '90 days')::text
union all select 17, 'AI apps listed', (select count(*) from v_apps)::text
union all select 18, 'Everyday tasks mapped', (select count(*) from entities where type = 'task' and is_published)::text
order by n;
