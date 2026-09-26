-- =====================================================================
-- 0008 — Publication rules + public read model for the website
--  * MCP servers that are active in the registry get published
--    (the website only ever sees published rows).
--  * Meaningful change events become public signals.
--  * v_mcp_servers / v_site_stats: flat read models for the site.
--  * Hourly cron keeps publication in sync with the robots.
-- =====================================================================

-- signals: "new" entities are only newsworthy after the initial bulk import
insert into engine_config(key, value)
values ('signals.new_entity_since', to_jsonb(now()))
on conflict (key) do nothing;

create or replace function publish_entities() returns jsonb language plpgsql as $$
declare n_pub int; n_unpub int; n_sig int; v_since timestamptz;
begin
  -- MCP servers: active + declared through a source
  update entities set is_published = true, confidence = 'medium'
   where type = 'mcp_server' and status = 'active' and not is_published
     and attributes ? 'protocol.mcp';
  get diagnostics n_pub = row_count;

  update entities set is_published = false
   where type = 'mcp_server' and is_published and status <> 'active';
  get diagnostics n_unpub = row_count;

  v_since := coalesce((select (value #>> '{}')::timestamptz from engine_config where key = 'signals.new_entity_since'), now());

  update change_events ev set is_published = true
    from entities e
   where e.id = ev.entity_id and e.is_published and not ev.is_published
     and (
       ev.event_type in ('new_version','protocol_added','protocol_removed','price_increase','price_decrease',
                         'plan_added','went_offline','back_online','capability_added','discontinued')
       or (ev.event_type = 'field_changed' and ev.field in ('transport.remote','transport.local','registry.status'))
       or (ev.event_type = 'new_entity' and ev.detected_at > v_since)
     );
  get diagnostics n_sig = row_count;

  return jsonb_build_object('published', n_pub, 'unpublished', n_unpub, 'signals', n_sig);
end $$;
revoke execute on function publish_entities() from public, anon, authenticated;

-- Flat read model for MCP server pages (owner view: filters published rows itself)
create or replace view v_mcp_servers as
select e.id, e.slug, e.name, e.short_description, e.website, e.status,
       e.first_seen_at, e.last_seen_at, e.last_verified_at,
       e.attributes->'version'->>'value'             as version,
       (e.attributes->'transport.remote'->'value')::text::boolean as remote,
       (e.attributes->'transport.local'->'value')::text::boolean  as local,
       e.attributes->'package.registries'->'value'   as packages,
       e.attributes->'repository.url'->>'value'      as repository_url,
       e.attributes->'registry.status'->>'value'     as registry_status,
       (select a.value from entity_aliases a where a.entity_id = e.id and a.alias_type = 'mcp_registry' limit 1) as registry_name
from entities e
where e.type = 'mcp_server' and e.is_published;

-- Site-wide counters for the ticker (only what the database really holds)
create or replace view v_site_stats as
select
  (select count(*) from entities where type = 'mcp_server' and is_published)                  as mcp_servers,
  (select count(*) from entities where type = 'agent' and is_published)                       as agents,
  (select count(*) from entities where type = 'task' and is_published)                        as tasks,
  (select count(*) from entities where type = 'capability' and is_published)                  as capabilities,
  (select count(*) from sources where is_active)                                              as active_sources,
  (select count(*) from sources)                                                              as mapped_sources,
  (select count(*) from change_events where is_published and detected_at > now() - interval '24 hours') as signals_24h,
  (select max(finished_at) from crawl_runs where status in ('success','partial'))            as last_update;

-- Taxonomy read model: tasks with their category and required capabilities
create or replace view v_tasks as
select t.id, t.slug, t.name,
       c.slug as category_slug, c.name as category,
       coalesce((select jsonb_agg(jsonb_build_object('slug', cap.slug, 'name', cap.name) order by cap.name)
                   from relations r join entities cap on cap.id = r.to_id
                  where r.from_id = t.id and r.relation = 'requires_capability' and r.valid_to is null), '[]'::jsonb) as capabilities
from entities t
left join relations rc on rc.from_id = t.id and rc.relation = 'in_category' and rc.valid_to is null
left join entities c on c.id = rc.to_id
where t.type = 'task' and t.is_published;

create or replace view v_capabilities as
select cap.id, cap.slug, cap.name,
       (select count(*) from relations r where r.to_id = cap.id and r.relation = 'requires_capability' and r.valid_to is null) as tasks_count,
       (select count(*) from relations r join entities a on a.id = r.from_id
         where r.to_id = cap.id and r.relation = 'has_capability' and r.valid_to is null and a.is_published) as providers_count
from entities cap
where cap.type = 'capability' and cap.is_published;

grant select on v_mcp_servers, v_site_stats, v_tasks, v_capabilities to anon, authenticated;

-- first publication now
select publish_entities();
