-- ELECTRA INDEX — INSTALL_TOOLPAGES_1 : richer tool pages (how to connect, full description)
-- Paste everything into Supabase > SQL Editor > Run.

-- =====================================================================
-- 0018 — Richer tool pages
--  * The MCP robot now also stores how to connect to each tool:
--    hosted endpoints (mcp.remotes) and install packages (mcp.packages),
--    plus the full publisher description.
--  * v_mcp_servers exposes them to the site.
--  * A full re-crawl is requested so existing tools get the new facts
--    (the robot works through the registry in the background, ~1 hour).
-- =====================================================================
create or replace function ingest_mcp_server(p_item jsonb, p_run uuid)
returns text language plpgsql as $$     -- returns 'new' | 'changed' | 'same' | 'skipped'
declare
  s        jsonb := coalesce(p_item->'server', p_item);
  m        jsonb := p_item->'_meta'->'io.modelcontextprotocol.registry/official';
  v_name   text  := s->>'name';
  v_title  text;
  v_repo   text;
  v_web    text  := nullif(s->>'websiteUrl', '');
  v_aliases jsonb := '[]'::jsonb;
  v_id     uuid;
  v_is_new boolean;
  v_events_before int;
  v_events_after  int;
  p        jsonb;
begin
  if v_name is null then return 'skipped'; end if;
  if m is not null and (m->>'isLatest') = 'false' then return 'skipped'; end if;  -- latest version only

  v_title := coalesce(nullif(s->>'title', ''),
                      -- "io.github.acme/weather-mcp" -> "weather-mcp"
                      regexp_replace(v_name, '^.*/', ''));

  -- identifiers used for de-duplication
  v_aliases := v_aliases || jsonb_build_array(jsonb_build_object('type','mcp_registry','value', v_name));
  if s->'repository'->>'url' ilike '%github.com/%' then
    v_repo := norm_alias('github_repo', s->'repository'->>'url');
    -- monorepos host many servers: include the subfolder so they don't merge
    if coalesce(s->'repository'->>'subfolder', '') <> '' then
      v_repo := v_repo || '/' || trim(both '/' from s->'repository'->>'subfolder');
    end if;
    v_aliases := v_aliases || jsonb_build_array(jsonb_build_object('type','github_repo','value', v_repo));
  end if;
  for p in select * from jsonb_array_elements(coalesce(s->'packages','[]'::jsonb)) loop
    if p->>'registryType' in ('npm','pypi') and p->>'identifier' is not null then
      v_aliases := v_aliases || jsonb_build_array(jsonb_build_object('type', p->>'registryType', 'value', p->>'identifier'));
    elsif p->>'registryType' = 'oci' and p->>'identifier' is not null then
      v_aliases := v_aliases || jsonb_build_array(jsonb_build_object('type','docker','value', p->>'identifier'));
    end if;
  end loop;

  v_is_new := not exists (select 1 from entity_aliases where alias_type = 'mcp_registry' and value = lower(v_name));
  v_id := resolve_entity('mcp_server', v_title, v_aliases, 'SRC-001', v_web, left(s->>'description', 300));

  select count(*) into v_events_before from change_events where entity_id = v_id;

  -- facts, all "declared" by the publisher through the registry
  perform record_observation(v_id, 'protocol.mcp', 'true', 'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  if s->>'version' is not null then
    perform record_observation(v_id, 'version', to_jsonb(s->>'version'), 'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  if m->>'status' is not null then
    perform record_observation(v_id, 'registry.status', to_jsonb(m->>'status'), 'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  if s->'repository'->>'url' is not null then
    perform record_observation(v_id, 'repository.url',
            to_jsonb(regexp_replace(trim(s->'repository'->>'url'), '(\.git)?/*$', '')), 'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  if v_web is not null then
    perform record_observation(v_id, 'website.url', to_jsonb(v_web), 'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  perform record_observation(v_id, 'transport.remote',
          to_jsonb(jsonb_array_length(coalesce(s->'remotes','[]'::jsonb)) > 0), 'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  perform record_observation(v_id, 'transport.local',
          to_jsonb(jsonb_array_length(coalesce(s->'packages','[]'::jsonb)) > 0), 'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  if jsonb_array_length(coalesce(s->'packages','[]'::jsonb)) > 0 then
    perform record_observation(v_id, 'package.registries',
            (select jsonb_agg(distinct x->>'registryType' order by x->>'registryType')
               from jsonb_array_elements(s->'packages') x where x->>'registryType' is not null),
            'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  -- how to connect: hosted endpoints and installable packages (shown on the tool page)
  if jsonb_array_length(coalesce(s->'remotes','[]'::jsonb)) > 0 then
    perform record_observation(v_id, 'mcp.remotes',
            (select jsonb_agg(jsonb_build_object('type', x->>'type', 'url', x->>'url') order by x->>'url')
               from jsonb_array_elements(s->'remotes') x where coalesce(x->>'url','') <> ''),
            'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  if jsonb_array_length(coalesce(s->'packages','[]'::jsonb)) > 0 then
    perform record_observation(v_id, 'mcp.packages',
            (select jsonb_agg(jsonb_build_object('registry', x->>'registryType', 'identifier', x->>'identifier',
                    'version', x->>'version', 'transport', x->'transport'->>'type') order by x->>'registryType', x->>'identifier')
               from jsonb_array_elements(s->'packages') x where coalesce(x->>'identifier','') <> ''),
            'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  -- full publisher description (short_description keeps the first 300 characters)
  if coalesce(s->>'description','') <> '' then
    update entities set description = s->>'description', short_description = coalesce(short_description, left(s->>'description', 300))
     where id = v_id and description is distinct from s->>'description';
  end if;

  -- a registry entry marked deleted/deprecated makes the entity inactive (history is kept)
  if m->>'status' in ('deleted','deprecated') then
    update entities set status = 'inactive' where id = v_id and status <> 'inactive';
  elsif (select status from entities where id = v_id) = 'candidate' then
    update entities set status = 'active' where id = v_id;
  end if;

  select count(*) into v_events_after from change_events where entity_id = v_id;
  return case when v_is_new then 'new' when v_events_after > v_events_before then 'changed' else 'same' end;
end $$;


create or replace view v_mcp_servers as
select e.id, e.slug, e.name, e.short_description, e.website, e.status,
       e.first_seen_at, e.last_seen_at, e.last_verified_at,
       e.attributes->'version'->>'value'             as version,
       (e.attributes->'transport.remote'->'value')::text::boolean as remote,
       (e.attributes->'transport.local'->'value')::text::boolean  as local,
       e.attributes->'package.registries'->'value'   as packages,
       e.attributes->'repository.url'->>'value'      as repository_url,
       e.attributes->'registry.status'->>'value'     as registry_status,
       (select a.value from entity_aliases a where a.entity_id = e.id and a.alias_type = 'mcp_registry' limit 1) as registry_name,
       e.description,
       e.attributes->'mcp.remotes'->'value'          as remotes,
       e.attributes->'mcp.packages'->'value'         as package_list
from entities e
where e.type = 'mcp_server' and e.is_published;
grant select on v_mcp_servers to anon, authenticated;

select request_full_recrawl('bot.mcp_registry');

select 'tool pages ready' as status, (select count(*) from v_mcp_servers) as tools, (select value->>'last_complete' is null from engine_config where key = 'bot.mcp_registry') as full_recrawl_requested;
