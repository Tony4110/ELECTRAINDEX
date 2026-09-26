-- =====================================================================
-- 0006 — Fixes after the first live run
--  1. Names written only in non-Latin scripts (Korean, Arabic…) produced an
--     empty slug. resolve_entity now falls back to the first alias
--     (e.g. registry name "com.whooing/whooing") and then to a short hash.
--  2. Weekly full re-crawl of the MCP Registry (Monday 03:00 UTC) so that
--     anything missed by a failed run is picked up again.
-- =====================================================================

create or replace function safe_slug(p_name text, p_aliases jsonb) returns text language sql immutable as $$
  select coalesce(
    nullif(slugify(p_name), ''),
    nullif(slugify(regexp_replace(coalesce(p_aliases->0->>'value', ''), '^.*/', '')), ''),
    nullif(slugify(coalesce(p_aliases->0->>'value', '')), ''),
    'item-' || substr(md5(coalesce(p_name, '') || coalesce(p_aliases::text, '')), 1, 8))
$$;

create or replace function resolve_entity(
  p_type        text,
  p_name        text,
  p_aliases     jsonb,
  p_source_code text,
  p_website     text default null,
  p_short_desc  text default null
) returns uuid language plpgsql as $$
declare
  v_src   uuid := source_id_of(p_source_code);
  v_ids   uuid[];
  v_id    uuid;
  v_base  text;
  v_slug  text;
  v_n     int := 0;
  a       jsonb;
begin
  if v_src is null then raise exception 'Unknown source %', p_source_code; end if;

  select array_agg(distinct coalesce(e.merged_into, e.id)) into v_ids
  from jsonb_array_elements(p_aliases) x
  join entity_aliases al on al.alias_type = x->>'type'
                        and al.value = norm_alias(x->>'type', x->>'value')
  join entities e on e.id = al.entity_id
  where e.type = p_type;

  if v_ids is null then
    v_base := safe_slug(p_name, p_aliases);
    v_slug := v_base;
    while exists (select 1 from entities where type = p_type and slug = v_slug) loop
      v_n := v_n + 1; v_slug := v_base || '-' || v_n;
    end loop;
    insert into entities(type, slug, name, website, short_description)
    values (p_type, v_slug, p_name, p_website, p_short_desc)
    returning id into v_id;
    insert into change_events(entity_id, event_type, new_value, source_id, importance)
    values (v_id, 'new_entity', to_jsonb(p_name), v_src, 2);
  else
    select id into v_id from entities where id = any(v_ids) order by first_seen_at, id limit 1;
    update entities set last_seen_at = now() where id = v_id;
    if array_length(v_ids, 1) > 1 then
      insert into review_queue(entity_id, reason, payload)
      values (v_id, 'possible_duplicate', jsonb_build_object('entity_ids', v_ids, 'aliases', p_aliases));
    end if;
  end if;

  for a in select * from jsonb_array_elements(p_aliases) loop
    insert into entity_aliases(entity_id, alias_type, value, source_id)
    values (v_id, a->>'type', norm_alias(a->>'type', a->>'value'), v_src)
    on conflict (alias_type, value) do nothing;
  end loop;

  return v_id;
end $$;
revoke execute on function resolve_entity(text,text,jsonb,text,text,text) from public, anon, authenticated;

-- forces the next robot run to do a full crawl (only when no crawl is in progress)
create or replace function request_full_recrawl(p_key text) returns void language sql as $$
  update engine_config set value = value - 'last_complete', updated_at = now()
  where key = p_key and coalesce(value->>'cursor', '') = ''
$$;
revoke execute on function request_full_recrawl(text) from public, anon, authenticated;
