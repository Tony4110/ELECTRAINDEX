-- =====================================================================
-- 0004 — Robot #1 : Discovery · Official MCP Registry (SRC-001)
-- Bot helpers (runs, state) + batch ingestion of registry pages.
-- The Edge Function only fetches pages and calls ingest_mcp_servers().
-- =====================================================================

-- ---------- bot runs & state -----------------------------------------
create or replace function start_crawl_run(p_bot bot_name, p_source_code text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  -- lock: never two runs of the same bot+source at the same time (stale after 10 min)
  if exists (select 1 from crawl_runs
             where bot = p_bot and source_id = source_id_of(p_source_code)
               and status = 'running' and started_at > now() - interval '10 minutes') then
    return null;
  end if;
  update crawl_runs set status = 'failed', finished_at = now(),
         log = log || '{"reason":"stale run closed automatically"}'
   where bot = p_bot and source_id = source_id_of(p_source_code) and status = 'running';
  insert into crawl_runs(bot, source_id) values (p_bot, source_id_of(p_source_code)) returning id into v_id;
  return v_id;
end $$;

create or replace function finish_crawl_run(p_run uuid, p_status run_status, p_seen int, p_new int,
                                            p_changed int, p_errors int, p_log jsonb default '{}')
returns void language sql as $$
  update crawl_runs set status = p_status, finished_at = now(), items_seen = p_seen, items_new = p_new,
         items_changed = p_changed, errors = p_errors, log = log || coalesce(p_log, '{}'::jsonb)
  where id = p_run
$$;

create or replace function get_state(p_key text) returns jsonb language sql stable as $$
  select value from engine_config where key = p_key
$$;

create or replace function set_state(p_key text, p_value jsonb) returns void language sql as $$
  insert into engine_config(key, value) values (p_key, coalesce(p_value, 'null'::jsonb))
  on conflict (key) do update set value = excluded.value, updated_at = now()
$$;

-- ---------- one registry entry -> engine calls ------------------------
-- Registry format (v0.1): { "server": {name,title,description,version,repository{url,source,subfolder},
--   websiteUrl, packages[{registryType,identifier,version}], remotes[{type,url}]},
--   "_meta": {"io.modelcontextprotocol.registry/official": {status,publishedAt,updatedAt,isLatest}} }
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
  -- a registry entry marked deleted/deprecated makes the entity inactive (history is kept)
  if m->>'status' in ('deleted','deprecated') then
    update entities set status = 'inactive' where id = v_id and status <> 'inactive';
  elsif (select status from entities where id = v_id) = 'candidate' then
    update entities set status = 'active' where id = v_id;
  end if;

  select count(*) into v_events_after from change_events where entity_id = v_id;
  return case when v_is_new then 'new' when v_events_after > v_events_before then 'changed' else 'same' end;
end $$;

-- ---------- a whole page (called by the Edge Function) ----------------
create or replace function ingest_mcp_servers(p_items jsonb, p_run uuid)
returns jsonb language plpgsql as $$
declare
  it jsonb; r text;
  n_seen int := 0; n_new int := 0; n_changed int := 0; n_err int := 0;
  errs jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    n_seen := n_seen + 1;
    begin
      r := ingest_mcp_server(it, p_run);
      if r = 'new' then n_new := n_new + 1; elsif r = 'changed' then n_changed := n_changed + 1; end if;
    exception when others then
      n_err := n_err + 1;
      if jsonb_array_length(errs) < 5 then
        errs := errs || jsonb_build_array(jsonb_build_object('name', coalesce(it->'server'->>'name', it->>'name'), 'error', sqlerrm));
      end if;
    end;
  end loop;
  return jsonb_build_object('seen', n_seen, 'new', n_new, 'changed', n_changed, 'errors', n_err, 'error_samples', errs);
end $$;

revoke execute on function start_crawl_run(bot_name, text) from public, anon, authenticated;
revoke execute on function finish_crawl_run(uuid, run_status, int, int, int, int, jsonb) from public, anon, authenticated;
revoke execute on function get_state(text) from public, anon, authenticated;
revoke execute on function set_state(text, jsonb) from public, anon, authenticated;
revoke execute on function ingest_mcp_server(jsonb, uuid) from public, anon, authenticated;
revoke execute on function ingest_mcp_servers(jsonb, uuid) from public, anon, authenticated;

-- Monitoring: last runs of the robot
create or replace view v_bot_runs with (security_invoker = true) as
select r.started_at, r.finished_at, r.bot, s.code as source, r.status,
       r.items_seen, r.items_new, r.items_changed, r.errors,
       r.log->>'mode' as mode, (r.log->>'pages')::int as pages, r.log->'error_samples' as error_samples,
       r.log->>'error' as error
from crawl_runs r left join sources s on s.id = r.source_id
order by r.started_at desc;
