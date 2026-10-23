-- ELECTRA INDEX — PROCESS_SUBMISSIONS_5 : "bead-colors-mcp" (tool, 23 Oct 2026, Publisher Program: yes)
--  Local MCP server (stdio, MIT) by jsspace / Meltbead: https://github.com/jsspace/bead-colors-mcp
--  Our MCP index is built from the Official MCP Registry. This links the request to the server page
--  if the registry robot already lists it; otherwise the request stays "new" until it is published there.
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable.

with m as (
  select s.id as sid,
         (select e.id from entities e
           where e.type = 'mcp_server' and e.is_published
             and (e.slug like '%bead-colors%'
                  or e.attributes->'repository.url'->>'value' ilike '%jsspace/bead-colors-mcp%'
                  or exists (select 1 from entity_aliases a where a.entity_id = e.id and a.value ilike '%bead-colors-mcp%'))
           order by e.last_seen_at desc limit 1) as eid
    from submissions s where s.name = 'bead-colors-mcp' and s.status in ('new', 'duplicate')
)
update submissions s set status = 'listed', reviewed_at = now(), entity_id = m.eid
  from m where s.id = m.sid and m.eid is not null;

select s.name, s.status, s.created_at::date as received,
       coalesce('https://electraindex.com/mcp/' || e.slug, 'not in the Official MCP Registry yet') as page
  from submissions s left join entities e on e.id = s.entity_id
 where s.name = 'bead-colors-mcp';
