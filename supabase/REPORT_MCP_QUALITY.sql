-- ELECTRA INDEX — REPORT_MCP_QUALITY : how many MCP pages are rich enough for Google (READ ONLY, changes nothing)
-- Paste all in Supabase > SQL Editor > Run, then send the table.
with m as (
  select e.id,
         length(trim(coalesce(e.description, e.short_description, ''))) as dlen,
         (e.attributes->'repository.url'->>'value') is not null as has_repo,
         exists (select 1 from relations r where r.from_id = e.id and r.relation = 'has_capability' and r.valid_to is null) as has_cap,
         coalesce(s.status = 'online' and s.tool_count > 0, false) as live_tools,
         coalesce(s.status in ('online', 'auth_required'), false) as reachable
    from entities e
    left join mcp_live_status s on s.entity_id = e.id
   where e.type = 'mcp_server' and e.is_published
)
select 1 as ord, 'All published MCP pages' as item, count(*) as pages from m
union all select 2, 'Description under 50 characters (already hidden from Google)', count(*) from m where dlen < 50
union all select 3, 'Description 50-119 characters', count(*) from m where dlen between 50 and 119
union all select 4, 'Description 120+ characters', count(*) from m where dlen >= 120
union all select 5, 'Tested online with its tools listed', count(*) from m where live_tools
union all select 6, 'Reachable when tested (online or asks for a key)', count(*) from m where reachable
union all select 7, 'Matched to at least one use case', count(*) from m where has_cap
union all select 8, 'Has a source code repository', count(*) from m where has_repo
union all select 9, 'STRONG: tools listed live, OR (120+ chars and a use case)', count(*) from m where live_tools or (dlen >= 120 and has_cap)
union all select 10, 'WEAK: everything else (candidates to hide from Google)', count(*) from m where not (live_tools or (dlen >= 120 and has_cap))
order by ord;
