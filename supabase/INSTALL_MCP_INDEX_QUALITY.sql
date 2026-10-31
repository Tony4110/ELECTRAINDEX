-- ELECTRA INDEX — INSTALL_MCP_INDEX_QUALITY : show Google only the MCP pages with real, unique content
--  Every MCP page stays on the site for visitors. Only the "strong" ones are offered to Google
--  (sitemap + indexable); the others get "noindex, follow".
--  Strong =  our robot reached it and listed its tools (unique, dated data nobody else publishes)
--         OR a source repository + at least one use case + a description of 80+ characters
--            (local servers cannot be tested live; these are the documented ones).
-- Paste all in Supabase > SQL Editor > Run. Re-runnable.

create or replace view v_mcp_index as
select e.slug,
       e.last_seen_at,
       (coalesce(s.status = 'online' and s.tool_count > 0, false)
        or ((e.attributes->'repository.url'->>'value') is not null
            and length(trim(coalesce(e.description, e.short_description, ''))) >= 80
            and exists (select 1 from relations r where r.from_id = e.id and r.relation = 'has_capability' and r.valid_to is null))) as indexable
  from entities e
  left join mcp_live_status s on s.entity_id = e.id
 where e.type = 'mcp_server' and e.is_published;
grant select on v_mcp_index to anon, authenticated;

select indexable, count(*) as pages from v_mcp_index group by indexable order by indexable desc;
