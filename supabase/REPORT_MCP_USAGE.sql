-- ELECTRA INDEX — REPORT_MCP_USAGE (read-only): how AI assistants use the Electra Index MCP server
select date_trunc('day', at)::date as day, tool, count(*) as calls, count(*) filter (where paid) as paid_calls,
       count(distinct client) as clients
  from mcp_usage where at > now() - interval '30 days'
 group by 1, 2 order by 1 desc, 3 desc;
