-- =====================================================================
-- 0033 — Registry robot follows publisher updates of title, homepage and description
--  Until now the name, website and short description were set once, when a
--  server was first seen. A publisher who renamed the server or changed its
--  homepage in the Official MCP Registry was not followed (reported by the
--  Arcmira team through "List your agent"). From now on every crawl applies
--  them. Page addresses (slugs) never change. Existing pages are refreshed by
--  the weekly full re-crawl (Monday 03:00 UTC) or by request_full_recrawl().
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
            (select jsonb_agg(jsonb_build_object('type', x->>'type', 'url', x->>'url',
                    'headers', (select jsonb_agg(jsonb_build_object('name', h->>'name', 'required', coalesce((h->>'isRequired')::boolean, false), 'secret', coalesce((h->>'isSecret')::boolean, false)))
                                  from jsonb_array_elements(coalesce(x->'headers','[]'::jsonb)) h where coalesce(h->>'name','') <> '')) order by x->>'url')
               from jsonb_array_elements(s->'remotes') x where coalesce(x->>'url','') <> ''),
            'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  if jsonb_array_length(coalesce(s->'packages','[]'::jsonb)) > 0 then
    perform record_observation(v_id, 'mcp.packages',
            (select jsonb_agg(jsonb_build_object('registry', x->>'registryType', 'identifier', x->>'identifier',
                    'version', x->>'version', 'transport', x->'transport'->>'type',
                    'env', (select jsonb_agg(jsonb_build_object('name', v->>'name', 'required', coalesce((v->>'isRequired')::boolean, false), 'secret', coalesce((v->>'isSecret')::boolean, false)))
                              from jsonb_array_elements(coalesce(x->'environmentVariables','[]'::jsonb)) v where coalesce(v->>'name','') <> ''),
                    'required_args', (select count(*) from jsonb_array_elements(coalesce(x->'packageArguments','[]'::jsonb)) a where coalesce((a->>'isRequired')::boolean, false)),
                    'runtime_args', jsonb_array_length(coalesce(x->'runtimeArguments','[]'::jsonb))) order by x->>'registryType', x->>'identifier')
               from jsonb_array_elements(s->'packages') x where coalesce(x->>'identifier','') <> ''),
            'declared', 'SRC-001', 'high', null, null, 'mcp-registry-v0.1', null, p_run);
  end if;
  -- full publisher description; the short one follows it when the publisher changes it
  if coalesce(s->>'description','') <> '' then
    update entities set description = s->>'description', short_description = left(s->>'description', 300)
     where id = v_id and description is distinct from s->>'description';
  end if;
  -- the publisher renamed the server (registry "title") or changed its homepage: follow it.
  -- The page address (slug) never changes, so links and Google rankings are kept.
  if coalesce(s->>'title', '') <> '' then
    update entities set name = s->>'title' where id = v_id and name is distinct from s->>'title';
  end if;
  if v_web is not null then
    update entities set website = v_web where id = v_id and website is distinct from v_web;
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
