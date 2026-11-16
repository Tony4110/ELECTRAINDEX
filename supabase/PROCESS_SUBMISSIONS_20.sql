-- ELECTRA INDEX — PROCESS_SUBMISSIONS_20 : "Reeling" (tool, 16 Nov 2026, Publisher Program: no)
--  Social publishing workspace with an open-source MCP server (github.com/yomariano/reeling-mcp): https://reeling.app
--  Our MCP index is built from the Official MCP Registry. This links the request to the server page
--  if the registry robot already lists it (status "listed" sends the standard listing email automatically);
--  otherwise the request stays "new" until Reeling publishes its server there. Changes nothing else.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

with m as (
  select s.id as sid,
         (select e.id from entities e
           where e.type = 'mcp_server' and e.is_published
             and (e.slug ilike 'reeling%'
                  or e.name ilike 'reeling%'
                  or e.attributes->'website.url'->>'value' ilike '%reeling.app%'
                  or e.attributes->'repository.url'->>'value' ilike '%yomariano/reeling-mcp%'
                  or (e.attributes->'mcp.remotes')::text ilike '%reeling.app%'
                  or exists (select 1 from entity_aliases a where a.entity_id = e.id and (a.value ilike '%reeling-mcp%' or a.value ilike '%reeling.app%')))
           order by e.last_seen_at desc limit 1) as eid
    from submissions s where s.website ilike '%reeling.app%' and s.status in ('new', 'duplicate')
)
update submissions s set status = 'listed', reviewed_at = now(), entity_id = m.eid
  from m where s.id = m.sid and m.eid is not null;

select s.name, s.status, s.created_at::date as received,
       coalesce('https://electraindex.com/mcp/' || e.slug, 'not in the Official MCP Registry yet') as page
  from submissions s left join entities e on e.id = s.entity_id
 where s.website ilike '%reeling.app%';
