-- ELECTRA INDEX — FIX_ARCMIRA_2 : applies Arcmira's correction to the exact page https://electraindex.com/mcp/arcmira
--  (first version picked 'the most recent' Arcmira entry, which may be another one). Re-runnable.
-- Paste everything into Supabase > SQL Editor > Run.

-- =====================================================================
-- 0052 — Publisher corrections
--  * MCP server pages can show the publisher's documentation and MCP setup
--    links (attributes docs.url and mcp.setup_url, source "publisher").
--  * publisher_correction(): applies a publisher's request in one call:
--    remove wrong use cases (kept in history), add the right ones (declared
--    by the publisher), set the links, then refresh the use-case pages.
--    The keyword robot classifies a product only once, so a correction stays.
-- =====================================================================
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
       e.attributes->'mcp.packages'->'value'         as package_list,
       e.attributes->'docs.url'->>'value'            as docs_url,
       e.attributes->'mcp.setup_url'->>'value'       as mcp_setup_url
from entities e
where e.type = 'mcp_server' and e.is_published;
grant select on v_mcp_servers to anon, authenticated;

-- source for facts declared by publishers themselves (no source -> no claim)
insert into sources(code, name, layer, role, priority, access, reliability, is_active, notes)
values ('SRC-PUBLISHER', 'Publisher declaration (email to contact@electraindex.com)', 'Publishers', 'Source', 'P1', 'Email', 'medium', true,
        'Corrections and links sent by the publisher of a product; checked against its official pages before use.')
on conflict (code) do nothing;

create or replace function publisher_correction(p_type text, p_slug text,
                                                p_remove_caps text[] default '{}', p_add_caps text[] default '{}',
                                                p_docs_url text default null, p_setup_url text default null,
                                                p_note text default 'publisher request')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; n_rm int := 0; n_add int := 0; c record; v_src uuid := (select id from sources where code = 'SRC-PUBLISHER');
begin
  select id into v_id from entities where type = p_type and slug = p_slug;
  if v_id is null then raise exception 'product not found: % %', p_type, p_slug; end if;

  update relations r set valid_to = now()
    from entities cap
   where r.from_id = v_id and r.relation = 'has_capability' and r.valid_to is null
     and cap.id = r.to_id and cap.type = 'capability' and cap.slug = any(p_remove_caps);
  get diagnostics n_rm = row_count;

  for c in select id from entities where type = 'capability' and slug = any(p_add_caps) loop
    insert into relations(from_id, relation, to_id, evidence_level, confidence, source_id, evidence)
    values (v_id, 'has_capability', c.id, 'declared', 'high', v_src, p_note || ' (' || current_date || ')')
    on conflict (from_id, relation, to_id, evidence_level) do update set valid_to = null, last_seen_at = now(), evidence = excluded.evidence;
    n_add := n_add + 1;
  end loop;

  if p_docs_url ~* '^https://' then
    update entities set attributes = attributes || jsonb_build_object('docs.url', jsonb_build_object('value', p_docs_url, 'source', 'publisher', 'checked_at', current_date))
     where id = v_id;
  end if;
  if p_setup_url ~* '^https://' then
    update entities set attributes = attributes || jsonb_build_object('mcp.setup_url', jsonb_build_object('value', p_setup_url, 'source', 'publisher', 'checked_at', current_date))
     where id = v_id;
  end if;

  perform refresh_capability_tools();
  perform refresh_rankings();
  return jsonb_build_object('removed', n_rm, 'added', n_add);
end $$;
revoke execute on function publisher_correction(text, text, text[], text[], text, text, text) from public, anon, authenticated;

-- the correction, on the exact slug of the public page
select publisher_correction('mcp_server', 'arcmira',
         array['social-media-management'], array['web-research', 'competitor-monitoring'],
         'https://arcmira.com/docs', 'https://arcmira.com/docs/mcp-server', 'publisher request: search and mentions monitoring');

-- check every Arcmira entry: use cases, tasks, links
select e.slug, e.name, e.is_published, m.docs_url, m.mcp_setup_url,
       (select string_agg(p.capability, ', ' order by p.capability) from v_provider_capabilities p
         where p.provider_slug = e.slug and p.provider_type = 'mcp_server') as use_cases,
       (select string_agg(t.task_name, ', ' order by t.task_name) from v_task_rankings t where t.provider_id = e.id) as tasks
  from entities e left join v_mcp_servers m on m.id = e.id
 where e.type = 'mcp_server' and (e.name ilike '%arcmira%' or e.slug like '%arcmira%')
 order by e.slug;
