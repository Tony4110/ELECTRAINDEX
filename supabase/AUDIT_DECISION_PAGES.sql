-- ELECTRA INDEX — read-only quality check of "Best MCP servers for <use case>" pages.
-- For each use case: how many tools have the use case in their NAME (strong match),
-- the keywords that matched, and the first 5 tools exactly as the page shows them.
with ranked as (
  select capability, tool_name, name_match, keywords,
         row_number() over (partition by capability_slug order by name_match desc, remote desc, has_source desc, last_seen_at desc) as pos
    from v_capability_tools
), kw as (
  select capability, k, count(*) as n,
         row_number() over (partition by capability order by count(*) desc) as r
    from v_capability_tools, unnest(string_to_array(keywords, ', ')) k
   group by 1, 2
)
select o.capability as use_case, o.tools,
       (select count(*) from ranked r where r.capability = o.capability and r.name_match) as in_name,
       (select string_agg(k || ' ' || n, ', ' order by n desc) from kw where kw.capability = o.capability and kw.r <= 5) as top_keywords,
       (select string_agg(tool_name, ' | ' order by pos) from ranked r where r.capability = o.capability and pos <= 5) as first_5_on_page
  from v_capability_overview o
 where o.tools > 0
 order by o.tools desc;
