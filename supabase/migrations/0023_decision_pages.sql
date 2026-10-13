-- =====================================================================
-- 0023 — Decision pages: "Best MCP servers for <use case>"
--  Read-only views for the site. Nothing here changes a score, a ranking
--  formula, the crawler or existing data.
--  * mv_capability_tools: one row per (use case, tool) for tools whose
--    capability was matched by the keyword classifier, with plain facts
--    used to order the list: keyword found in the tool's NAME (stronger
--    relevance than description only), ready to connect (hosted endpoint
--    or installable package), public source code, last seen by the robot.
--  * v_capability_overview: counts per use case (tools, hosted, agents).
--  Refreshed hourly by its own cron job (refresh_rankings is untouched).
-- =====================================================================
drop materialized view if exists mv_capability_tools cascade;
create materialized view mv_capability_tools as
with m as (
  select r.to_id as capability_id, r.from_id as tool_id,
         string_agg(distinct regexp_replace(coalesce(r.evidence, ''), '^kw-v\d+:\s*', ''), ', ') as keywords
    from relations r
   where r.relation = 'has_capability' and r.valid_to is null
   group by 1, 2
)
select cap.slug as capability_slug, cap.name as capability,
       t.id as tool_id, t.slug as tool_slug, t.name as tool_name, t.short_description,
       m.keywords,
       exists (select 1 from unnest(string_to_array(m.keywords, ', ')) k
                where length(k) >= 3 and (t.name ilike '%' || k || '%' or t.slug ilike '%' || replace(k, ' ', '-') || '%')) as name_match,
       coalesce(t.remote, false) as remote,
       coalesce(t.local, false) as local,
       t.repository_url is not null as has_source,
       t.last_seen_at
  from m
  join entities cap on cap.id = m.capability_id and cap.type = 'capability'
  join v_mcp_servers t on t.id = m.tool_id
 where coalesce(t.registry_status, 'active') = 'active'
   and length(coalesce(t.short_description, '')) >= 50;

create unique index if not exists uq_mv_capability_tools on mv_capability_tools(capability_slug, tool_id);
create index if not exists idx_mv_capability_tools_order on mv_capability_tools(capability_slug, name_match desc, remote desc, has_source desc, last_seen_at desc);

create or replace view v_capability_tools as select * from mv_capability_tools;

create or replace view v_capability_overview as
select cap.slug as capability_slug, cap.name as capability,
       (select count(*) from mv_capability_tools x where x.capability_slug = cap.slug) as tools,
       (select count(*) from mv_capability_tools x where x.capability_slug = cap.slug and x.remote) as hosted_tools,
       (select count(*) from mv_capability_tools x where x.capability_slug = cap.slug and x.has_source) as open_source_tools,
       (select count(*) from v_provider_capabilities p where p.capability_slug = cap.slug and p.provider_type = 'agent') as agents
  from entities cap
 where cap.type = 'capability' and cap.is_published;

grant select on mv_capability_tools, v_capability_tools, v_capability_overview to anon, authenticated;

create or replace function refresh_capability_tools() returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently mv_capability_tools;
end $$;
revoke execute on function refresh_capability_tools() from public, anon, authenticated;
