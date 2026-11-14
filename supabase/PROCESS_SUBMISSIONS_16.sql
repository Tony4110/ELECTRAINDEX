-- ELECTRA INDEX — PROCESS_SUBMISSIONS_16 : LinkupAPI (tool, 29 Oct 2026) — remote MCP server, linkupapi.com
--  Public pricing verified 13 Nov 2026: from $55/month (15 accounts), Unlimited $3,000/month.
--  Links the request to the server page if the registry robot already lists it
--  (status "listed" sends the standard listing email automatically, badge first);
--  otherwise the request stays "new" until LinkupAPI publishes its server in the Official MCP Registry.
-- Re-runnable.

with m as (
  select s.id as sid,
         (select e.id from entities e
           where e.type = 'mcp_server' and e.is_published
             and (e.slug ilike '%linkupapi%'
                  or e.name ilike '%linkupapi%'
                  or e.attributes->'website.url'->>'value' ilike '%linkupapi.com%'
                  or e.attributes->'repository.url'->>'value' ilike '%linkupapi%'
                  or (e.attributes->'mcp.remotes')::text ilike '%linkupapi.com%'
                  or exists (select 1 from entity_aliases a where a.entity_id = e.id and a.value ilike '%linkupapi%'))
           order by e.last_seen_at desc limit 1) as eid
    from submissions s where s.website ilike '%linkupapi.com%' and s.status in ('new', 'duplicate')
)
update submissions s set status = 'listed', reviewed_at = now(), entity_id = m.eid
  from m where s.id = m.sid and m.eid is not null;

select s.name, s.status, s.created_at::date as received,
       coalesce('https://electraindex.com/mcp/' || e.slug, 'not in the Official MCP Registry yet') as page
  from submissions s left join entities e on e.id = s.entity_id
 where s.website ilike '%linkupapi.com%';
