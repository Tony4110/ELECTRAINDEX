-- ELECTRA INDEX — INSTALL_FIX_VERSIONS : stop fake 'new version' changes and alerts (e.g. Kinocut 1.16.4 <-> 1.6.19)
-- Paste all in Supabase > SQL Editor > Run. Safe to run twice. Last result = how many fake changes were hidden this week.

-- 0054 · Version flapping fix
-- Some MCP servers have several releases in the Official MCP Registry; the robot saw them alternately and
-- recorded fake "new version" changes back and forth (and emailed followers each time).
-- From now on a version only moves forward. Past back-and-forth events are hidden from pages, Pulse and alerts.

-- numeric parts of a version: '1.16.4' -> {1,16,4}; null when there is no number
create or replace function version_key(v text) returns int[] language sql immutable as $$
  select nullif(array(select x::int from unnest(regexp_split_to_array(regexp_replace(coalesce(v, ''), '[^0-9.]', '', 'g'), '[.]')) x
                       where x ~ '^[0-9]{1,9}$'), '{}'::int[])
$$;
create or replace function version_lt(a text, b text) returns boolean language sql immutable as $$
  select coalesce(version_key(a) < version_key(b), false)
$$;

create or replace function record_observation(
  p_entity_id    uuid,
  p_field        text,
  p_value        jsonb,
  p_evidence     evidence_level,
  p_source_code  text,
  p_confidence   confidence_lvl default 'medium',
  p_evidence_url text default null,
  p_evidence_txt text default null,
  p_extractor    text default null,
  p_snapshot_id  uuid default null,
  p_run_id       uuid default null
) returns uuid language plpgsql as $$
declare
  v_src   uuid := source_id_of(p_source_code);
  v_prev  observations%rowtype;
  v_id    uuid;
  v_evt   text;
  v_cur   jsonb;
  v_curv  text;
begin
  if v_src is null then raise exception 'Unknown source %', p_source_code; end if;
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    raise exception 'Unknown is not a value: do not record an observation (field %)', p_field;
  end if;

  select * into v_prev from observations
  where entity_id = p_entity_id and field = p_field and evidence_level = p_evidence
  order by observed_at desc limit 1;

  -- Versions only move forward. The MCP registry can list an old and a new release of the same
  -- server, so the robot may see 1.16.4, then 1.6.19, then 1.16.4 again: that is noise, not a change.
  if p_field = 'version' then
    v_curv := (select attributes->'version'->>'value' from entities where id = p_entity_id);
    if v_curv is not null and (p_value #>> '{}' = v_curv or version_lt(p_value #>> '{}', v_curv)) then
      if found then update observations set last_confirmed_at = now() where id = v_prev.id; end if;
      return v_prev.id;
    end if;
    if found and v_curv is not null then v_prev.value := to_jsonb(v_curv); end if;  -- "was" = the version shown
  end if;

  if found and v_prev.value = p_value then
    update observations set last_confirmed_at = now() where id = v_prev.id;
    v_id := v_prev.id;
  else
    insert into observations(entity_id, field, value, evidence_level, confidence, source_id,
                             snapshot_id, run_id, evidence, evidence_url, extractor)
    values (p_entity_id, p_field, p_value, p_evidence, p_confidence, v_src,
            p_snapshot_id, p_run_id, p_evidence_txt, p_evidence_url, p_extractor)
    returning id into v_id;

    if v_prev.id is not null then
      v_evt := case
        when p_field like 'protocol.%' and p_value = 'true'::jsonb  then 'protocol_added'
        when p_field like 'protocol.%' and p_value = 'false'::jsonb then 'protocol_removed'
        when p_field = 'status.online' and p_value = 'false'::jsonb then 'went_offline'
        when p_field = 'status.online' and p_value = 'true'::jsonb  then 'back_online'
        when p_field = 'version' then 'new_version'
        else 'field_changed' end;
      insert into change_events(entity_id, event_type, field, old_value, new_value,
                                source_id, observation_id, confidence)
      values (p_entity_id, v_evt, p_field, v_prev.value, p_value, v_src, v_id, p_confidence);
    end if;
  end if;

  -- current state: keep the strongest evidence (observed > declared > derived)
  v_cur := (select attributes -> p_field from entities where id = p_entity_id);
  if v_cur is null
     or evidence_rank(p_evidence) >= evidence_rank((v_cur->>'evidence')::evidence_level) then
    update entities set
      attributes = attributes || jsonb_build_object(p_field, jsonb_build_object(
                     'value', p_value, 'evidence', p_evidence, 'confidence', p_confidence,
                     'source', p_source_code, 'at', now())),
      last_seen_at = now(),
      last_verified_at = case when p_evidence = 'observed' then now() else last_verified_at end
    where id = p_entity_id;
  end if;

  return v_id;
end $$;


revoke execute on function record_observation(uuid,text,jsonb,evidence_level,text,confidence_lvl,text,text,text,uuid,uuid) from public, anon, authenticated;

-- 1) show the highest version ever seen on each page
update entities e
   set attributes = jsonb_set(e.attributes, '{version,value}', to_jsonb(m.v))
  from (select distinct on (entity_id) entity_id, value #>> '{}' as v
          from observations where field = 'version' and version_key(value #>> '{}') is not null
         order by entity_id, version_key(value #>> '{}') desc) m
 where e.id = m.entity_id and e.attributes ? 'version'
   and version_lt(e.attributes->'version'->>'value', m.v);

-- 2) hide fake changes: a version going backwards, or "upgrading" back to a version already seen before
update change_events ev set is_published = false
 where ev.event_type = 'new_version' and ev.is_published
   and (version_lt(ev.new_value #>> '{}', ev.old_value #>> '{}')
        or exists (select 1 from change_events e2
                    where e2.entity_id = ev.entity_id and e2.event_type = 'new_version'
                      and e2.detected_at < ev.detected_at and e2.old_value = ev.new_value));

select count(*) filter (where not is_published) as hidden_fake_changes_7d, count(*) filter (where is_published) as real_version_changes_7d
  from change_events where event_type = 'new_version' and detected_at > now() - interval '7 days';
