-- ELECTRA INDEX — FIX_SUBMISSION_DEED_PAGE : the deed.page request was linked to the wrong server (fiatdock-audit-mcp).
--  1. puts the request back to "new" (no page linked);
--  2. shows every MCP server that mentions deed.page and WHERE it does, plus the email that left.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

update submissions set status = 'new', entity_id = null, reviewed_at = null
 where website ilike '%deed.page%';

select e.slug, e.name, e.last_seen_at::date as seen,
       concat_ws(', ',
         case when e.slug ilike 'deed-page%' or e.name ilike 'deed%page%' then 'name' end,
         case when e.attributes->'website.url'->>'value' ilike '%deed.page%' then 'website: ' || (e.attributes->'website.url'->>'value') end,
         case when (e.attributes->'mcp.remotes')::text ilike '%deed.page%' then 'endpoint' end,
         case when e.attributes->'repository.url'->>'value' ilike '%/deed-page%' then 'repository' end,
         case when exists (select 1 from entity_aliases a where a.entity_id = e.id and a.value ilike '%deed.page%') then 'alias' end) as matched_on,
       (select n.created_at::text || ' · ' || n.subject from notify_log n
         where n.recipient = 'ops@avatar33.com' order by n.created_at desc limit 1) as email_to_deed_page
  from entities e
 where e.type = 'mcp_server' and e.is_published
   and (e.slug ilike 'deed-page%' or e.name ilike 'deed%page%'
        or e.attributes->'website.url'->>'value' ilike '%deed.page%'
        or (e.attributes->'mcp.remotes')::text ilike '%deed.page%'
        or e.attributes->'repository.url'->>'value' ilike '%/deed-page%'
        or exists (select 1 from entity_aliases a where a.entity_id = e.id and a.value ilike '%deed.page%'))
 order by e.last_seen_at desc;
