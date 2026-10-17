-- ELECTRA INDEX — REPORT_LIVECHECK (read-only)
-- 1. results by status
select * from v_live_check_report;
-- 2. requests still waiting for an answer, by phase
select phase, count(*) filter (where not applied) as waiting, count(*) filter (where applied) as done
  from mcp_live_checks group by phase order by phase;
-- 3. sample of servers (tool pages to open: electraindex.com/mcp/<slug>)
select e.slug, s.status, s.http, s.server_name, s.protocol_version, s.tool_count, left(s.detail, 60) as detail
  from mcp_live_status s join entities e on e.id = s.entity_id
 order by (s.status = 'online') desc, s.tool_count desc nulls last, e.slug
 limit 30;
