-- ELECTRA INDEX — REPORT_MEDIA_SPACE : how much sponsor space we have, and how many clicks our pages send
-- (to size the "Launch Spotlight" offer). Read-only. Paste into Supabase > SQL Editor > Run.
with pages as (
  select 'use case: best MCP servers for…' as page_type,
         (select count(*) from (select capability_slug from mv_capability_tools group by 1 having count(*) >= 3) x) as pages
  union all select 'use case: agent tasks', (select count(*) from v_tasks)
  union all select 'use case: themes', (select count(*) from v_theme_overview)
), clicks as (
  select case when page_path like '/mcp/best/%' then 'use case: best MCP servers for…'
              when page_path like '/tasks/%'    then 'use case: agent tasks'
              when page_path like '/themes/%'   then 'use case: themes'
              when page_path like '/agents/%'   then 'agent pages'
              when page_path like '/mcp/%'      then 'MCP server pages'
              when page_path like '/compare%'   then 'compare pages'
              when page_path = '/' or page_path = '' then 'home'
              else 'other' end as page_type,
         count(*) filter (where created_at > now() - interval '30 days') as clicks_30d,
         count(*) filter (where created_at > now() - interval '7 days')  as clicks_7d,
         count(distinct page_path) filter (where created_at > now() - interval '30 days') as pages_with_clicks_30d
    from outbound_clicks group by 1
)
select coalesce(p.page_type, c.page_type) as page_type, p.pages,
       coalesce(c.clicks_30d, 0) as clicks_30d, coalesce(c.clicks_7d, 0) as clicks_7d,
       coalesce(c.pages_with_clicks_30d, 0) as pages_with_clicks_30d
  from pages p full join clicks c on c.page_type = p.page_type
union all
select 'TOTAL', null, (select count(*) from outbound_clicks where created_at > now() - interval '30 days'),
       (select count(*) from outbound_clicks where created_at > now() - interval '7 days'), null
order by 3 desc;
