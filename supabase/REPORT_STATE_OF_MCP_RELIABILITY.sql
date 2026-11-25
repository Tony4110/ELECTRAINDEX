-- ELECTRA INDEX — REPORT_STATE_OF_MCP_RELIABILITY : the figures of the "State of MCP — Reliability" report.
-- READ ONLY, changes nothing. Paste in Supabase > SQL Editor > Run (may take up to a minute), then send the table to Claude.
-- Same rules as the public pages (mcp_check_class, rule B): answers = online + key required; failures = timeout,
-- unreachable, 5xx, not found, invalid MCP; 429 and other inconclusive replies are not counted; a figure needs 10 conclusive checks.

with
h as (   -- every check of the last 30 days, classified
  select x.entity_id, x.checked_at, x.status, x.http, mcp_check_class(x.status, x.http) as cls
    from mcp_live_history x
   where x.checked_at > now() - interval '30 days'
     and not exists (select 1 from mcp_check_incidents i where i.window_start = mcp_window(x.checked_at))
),
per as (  -- one row per server
  select entity_id,
         count(*) filter (where cls <> 'excluded') as conclusive,
         count(*) filter (where cls in ('open','protected')) as answers,
         count(*) filter (where cls = 'failure') as failures,
         count(*) filter (where cls = 'open') as open_n,
         count(*) filter (where cls = 'protected') as prot_n
    from h group by entity_id
),
rated as ( -- servers with a published figure (10+ conclusive checks)
  select p.*, round(100.0 * answers / conclusive, 1) as avail,
         (select a.value from entity_aliases a where a.entity_id = p.entity_id and a.alias_type = 'mcp_registry' limit 1) as registry_name,
         host_of(live_check_url(p.entity_id)) as host
    from per p where conclusive >= 10
),
r2 as (select *, (registry_name is not null and registry_name !~* '^io\.github\.') as official from rated),
hosts as (
  select host, count(*) as n, percentile_cont(0.5) within group (order by avail) as med,
         round(100.0 * count(*) filter (where avail >= 99) / count(*), 1) as pct99
    from r2 where host is not null group by host having count(*) >= 100
)
select * from (
  select 10 as ord, 'scope' as section, 'hosted MCP servers checked in 30 days' as metric, count(*)::text as value from per
  union all select 11, 'scope', 'checks in 30 days (conclusive)', sum(conclusive)::text from per
  union all select 12, 'scope', 'servers with a 30-day figure (10+ conclusive checks)', count(*)::text from r2
  union all select 13, 'scope', 'first check in our history', (select min(checked_at)::date::text from mcp_live_history)

  union all select 20, 'availability (servers with a figure)', 'median observed availability %', percentile_cont(0.5) within group (order by avail)::numeric(5,1)::text from r2
  union all select 21, 'availability (servers with a figure)', 'answered every check (100%)', count(*) filter (where avail = 100)::text || ' (' || round(100.0 * count(*) filter (where avail = 100) / count(*), 1) || '%)' from r2
  union all select 22, 'availability (servers with a figure)', '99% or more', count(*) filter (where avail >= 99)::text || ' (' || round(100.0 * count(*) filter (where avail >= 99) / count(*), 1) || '%)' from r2
  union all select 23, 'availability (servers with a figure)', '95% or more', count(*) filter (where avail >= 95)::text || ' (' || round(100.0 * count(*) filter (where avail >= 95) / count(*), 1) || '%)' from r2
  union all select 24, 'availability (servers with a figure)', 'between 50% and 95% (unstable)', count(*) filter (where avail >= 50 and avail < 95)::text || ' (' || round(100.0 * count(*) filter (where avail >= 50 and avail < 95) / count(*), 1) || '%)' from r2
  union all select 25, 'availability (servers with a figure)', 'under 50%', count(*) filter (where avail < 50)::text || ' (' || round(100.0 * count(*) filter (where avail < 50) / count(*), 1) || '%)' from r2
  union all select 26, 'availability (servers with a figure)', 'never answered (0%)', count(*) filter (where avail = 0)::text || ' (' || round(100.0 * count(*) filter (where avail = 0) / count(*), 1) || '%)' from r2
  union all select 27, 'availability (servers with a figure)', 'answered at least once but had 1+ failure', count(*) filter (where answers > 0 and failures > 0)::text || ' (' || round(100.0 * count(*) filter (where answers > 0 and failures > 0) / count(*), 1) || '%)' from r2

  union all select 30, 'access', 'servers that answered: open (no key)', count(*) filter (where answers > 0 and open_n >= prot_n)::text || ' (' || round(100.0 * count(*) filter (where answers > 0 and open_n >= prot_n) / nullif(count(*) filter (where answers > 0), 0), 1) || '%)' from r2
  union all select 31, 'access', 'servers that answered: key or sign-in required', count(*) filter (where answers > 0 and prot_n > open_n)::text || ' (' || round(100.0 * count(*) filter (where answers > 0 and prot_n > open_n) / nullif(count(*) filter (where answers > 0), 0), 1) || '%)' from r2

  union all select 40, 'official vs community', 'official (company domain): servers / median % / 99%+', count(*) filter (where official)::text || ' / ' || coalesce((percentile_cont(0.5) within group (order by avail) filter (where official))::numeric(5,1)::text, '-') || ' / ' || coalesce(round(100.0 * count(*) filter (where official and avail >= 99) / nullif(count(*) filter (where official), 0), 1)::text, '-') || '%' from r2
  union all select 41, 'official vs community', 'community (io.github.*): servers / median % / 99%+', count(*) filter (where not official)::text || ' / ' || coalesce((percentile_cont(0.5) within group (order by avail) filter (where not official))::numeric(5,1)::text, '-') || ' / ' || coalesce(round(100.0 * count(*) filter (where not official and avail >= 99) / nullif(count(*) filter (where not official), 0), 1)::text, '-') || '%' from r2

  union all select 50, 'failures (30 days, % of failed checks)', coalesce(case when status = 'timeout' then 'timeout (15 s)' when status = 'unreachable' then 'unreachable' when http between 500 and 599 then 'server error 5xx'
                                                       when status = 'not_found' or http in (404, 405, 410) then 'address not found (404/405/410)' when status = 'not_mcp' then 'not an MCP reply' else status end, '?'),
                          count(*)::text || ' (' || round(100.0 * count(*) / sum(count(*)) over (), 1) || '%)'
    from h where cls = 'failure' group by 3

  union all select 60, 'hosting platforms (100+ servers with a figure)', host || ': servers / median % / 99%+', n::text || ' / ' || med::numeric(5,1) || ' / ' || pct99 || '%' from hosts

  union all select 70, 'tools', 'tools listed by servers right now', (select count(*)::text from mcp_tools where last_seen_at > now() - interval '7 days')
  union all select 71, 'tools', 'tools added since tracking started (13 Nov)', (select count(*)::text from mcp_tools where first_seen_at > (select min(first_seen_at) from mcp_tools) + interval '1 day')
  union all select 72, 'tools', 'tools removed since tracking started', (select count(*)::text from mcp_tools t join mcp_live_status s on s.entity_id = t.entity_id
                                                                           where not coalesce(s.tools_more, false) and t.last_seen_at < s.checked_at - interval '1 hour')
  union all select 73, 'tools', 'servers whose tool list changed since tracking started', (select count(distinct t.entity_id)::text from mcp_tools t join mcp_live_status s on s.entity_id = t.entity_id
                                                                           where not coalesce(s.tools_more, false)
                                                                             and (t.last_seen_at < s.checked_at - interval '1 hour' or t.first_seen_at > (select min(first_seen_at) from mcp_tools) + interval '1 day'))
) r order by ord, value desc;
