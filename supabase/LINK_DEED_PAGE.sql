-- ELECTRA INDEX — LINK_DEED_PAGE : links the deed.page request to its real MCP page (slug deed-page).
--  Going to "listed" sends the correct listing email (with the right page and badge) automatically.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'mcp_server' and e.slug = 'deed-page' and e.is_published)
 where s.website ilike '%deed.page%' and s.status in ('new', 'duplicate')
   and exists (select 1 from entities e where e.type = 'mcp_server' and e.slug = 'deed-page' and e.is_published);

select s.name, s.status, 'https://electraindex.com/mcp/' || e.slug as page,
       (select n.created_at::text || ' · ' || n.subject from notify_log n
         where lower(n.recipient) = lower(s.contact_email) order by n.created_at desc limit 1) as last_email
  from submissions s left join entities e on e.id = s.entity_id
 where s.website ilike '%deed.page%';
