-- =====================================================================
-- DREAMOTION INDEX ENGINE — functions used by the bots  (engine v0.1)
-- Bots never write tables directly: they call these functions, so the
-- data rules (dedupe, history, change detection) live in ONE place.
-- =====================================================================

-- ---------- small utilities ------------------------------------------
create or replace function slugify(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(
           translate(p, 'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')),
         '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function norm_alias(p_type text, p_value text) returns text language sql immutable as $$
  select case p_type
    when 'domain' then regexp_replace(regexp_replace(lower(trim(p_value)), '^https?://', ''), '^www\.|/.*$', '', 'g')
    when 'github_repo' then regexp_replace(regexp_replace(lower(trim(p_value)), '^https?://github\.com/', ''), '(\.git)?/?$', '')
    else lower(trim(p_value))
  end
$$;

create or replace function source_id_of(p_code text) returns uuid language sql stable as $$
  select id from sources where code = p_code
$$;

create or replace function evidence_rank(e evidence_level) returns int language sql immutable as $$
  select case e when 'observed' then 3 when 'declared' then 2 else 1 end
$$;

-- ---------------------------------------------------------------------
-- resolve_entity : find-or-create an entity from any of its identifiers.
--   p_aliases = '[{"type":"domain","value":"cursor.com"},{"type":"github_repo","value":"…"}]'
--   - 1 match      -> returns it, adds missing aliases
--   - 0 match      -> creates a 'candidate' + a 'new_entity' event (unpublished)
--   - 2+ matches   -> returns the oldest, opens a possible_duplicate review
-- ---------------------------------------------------------------------
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
    v_slug := slugify(p_name);
    while exists (select 1 from entities where type = p_type and slug = v_slug) loop
      v_n := v_n + 1; v_slug := slugify(p_name) || '-' || v_n;
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

-- ---------------------------------------------------------------------
-- record_observation : store one fact, detect change, refresh current state
--   Same value as last time  -> only last_confirmed_at moves (no new row)
--   New value, history exists -> new row + change_event (old -> new)
--   First value ever          -> new row, NO change event (no history)
-- ---------------------------------------------------------------------
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
begin
  if v_src is null then raise exception 'Unknown source %', p_source_code; end if;
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    raise exception 'Unknown is not a value: do not record an observation (field %)', p_field;
  end if;

  select * into v_prev from observations
  where entity_id = p_entity_id and field = p_field and evidence_level = p_evidence
  order by observed_at desc limit 1;

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

-- ---------------------------------------------------------------------
-- record_price : append-only price history with increase/decrease events
-- ---------------------------------------------------------------------
create or replace function record_price(
  p_entity_id    uuid,
  p_plan         text,
  p_billing      text,
  p_amount       numeric,
  p_currency     text,
  p_interval     text,
  p_source_code  text,
  p_unit         text default null,
  p_is_trial     boolean default false,
  p_evidence_url text default null,
  p_snapshot_id  uuid default null,
  p_evidence     evidence_level default 'observed'
) returns uuid language plpgsql as $$
declare
  v_src  uuid := source_id_of(p_source_code);
  v_prev price_points%rowtype;
  v_id   uuid;
  v_had_plans boolean;
begin
  if v_src is null then raise exception 'Unknown source %', p_source_code; end if;

  select * into v_prev from price_points
  where entity_id = p_entity_id and lower(plan_name) = lower(p_plan)
  order by observed_at desc limit 1;

  if found
     and v_prev.billing_model = p_billing
     and v_prev.amount is not distinct from p_amount
     and v_prev.currency is not distinct from p_currency::char(3)
     and v_prev.interval is not distinct from p_interval
     and v_prev.unit is not distinct from p_unit then
    update price_points set last_confirmed_at = now() where id = v_prev.id;
    return v_prev.id;
  end if;

  select exists(select 1 from price_points where entity_id = p_entity_id) into v_had_plans;

  insert into price_points(entity_id, plan_name, billing_model, amount, currency, interval, unit,
                           is_trial, evidence_level, source_id, snapshot_id, evidence_url)
  values (p_entity_id, p_plan, p_billing, p_amount, p_currency, p_interval, p_unit,
          p_is_trial, p_evidence, v_src, p_snapshot_id, p_evidence_url)
  returning id into v_id;

  if v_prev.id is not null then
    insert into change_events(entity_id, event_type, field, old_value, new_value,
                              source_id, price_point_id, importance)
    values (p_entity_id,
            case when v_prev.currency = p_currency::char(3) and v_prev.interval = p_interval
                      and v_prev.amount is not null and p_amount is not null
                 then case when p_amount > v_prev.amount then 'price_increase'
                           when p_amount < v_prev.amount then 'price_decrease'
                           else 'field_changed' end
                 else 'field_changed' end,
            'price.' || slugify(p_plan),
            jsonb_build_object('amount', v_prev.amount, 'currency', v_prev.currency,
                               'interval', v_prev.interval, 'billing', v_prev.billing_model),
            jsonb_build_object('amount', p_amount, 'currency', p_currency,
                               'interval', p_interval, 'billing', p_billing),
            v_src, v_id, 3);
  elsif v_had_plans then
    insert into change_events(entity_id, event_type, field, new_value, source_id, price_point_id, importance)
    values (p_entity_id, 'plan_added', 'price.' || slugify(p_plan),
            jsonb_build_object('amount', p_amount, 'currency', p_currency, 'interval', p_interval),
            v_src, v_id, 2);
  end if;

  update entities set last_seen_at = now(),
         last_verified_at = case when p_evidence = 'observed' then now() else last_verified_at end
  where id = p_entity_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- link : create / refresh a graph edge (agent has_capability X…)
-- ---------------------------------------------------------------------
create or replace function link(
  p_from uuid, p_relation text, p_to uuid,
  p_evidence evidence_level, p_source_code text default null,
  p_confidence confidence_lvl default 'medium',
  p_evidence_txt text default null, p_evidence_url text default null
) returns uuid language plpgsql as $$
declare v_id uuid; v_new boolean;
begin
  insert into relations(from_id, relation, to_id, evidence_level, confidence, source_id, evidence, evidence_url)
  values (p_from, p_relation, p_to, p_evidence, p_confidence,
          case when p_source_code is null then null else source_id_of(p_source_code) end,
          p_evidence_txt, p_evidence_url)
  on conflict (from_id, relation, to_id, evidence_level)
  do update set last_seen_at = now(), valid_to = null, confidence = excluded.confidence
  returning id, (xmax = 0) into v_id, v_new;

  if v_new and p_relation = 'has_capability'
     and exists (select 1 from relations where from_id = p_from and relation = 'has_capability' and id <> v_id) then
    insert into change_events(entity_id, event_type, field, new_value, source_id, importance)
    values (p_from, 'capability_added', 'capability',
            to_jsonb((select slug from entities where id = p_to)),
            case when p_source_code is null then null else source_id_of(p_source_code) end, 2);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- record_metric + compute_momentum (needs >= 2 real points, else nothing)
-- ---------------------------------------------------------------------
create or replace function record_metric(p_entity uuid, p_metric text, p_value numeric,
                                         p_source_code text, p_at timestamptz default now())
returns void language sql as $$
  insert into metric_points(entity_id, metric, value, observed_at, source_id)
  values (p_entity, p_metric, p_value, p_at, source_id_of(p_source_code))
  on conflict (entity_id, metric, observed_at) do nothing
$$;

create or replace function compute_momentum(p_entity uuid, p_metric text, p_period text)
returns uuid language plpgsql as $$
declare
  v_window interval := case p_period when '7d' then interval '7 days'
                                     when '30d' then interval '30 days'
                                     when '90d' then interval '90 days' end;
  v_first numeric; v_last numeric; v_n int; v_id uuid;
begin
  if v_window is null then raise exception 'period must be 7d, 30d or 90d'; end if;
  select count(*),
         (array_agg(value order by observed_at asc))[1],
         (array_agg(value order by observed_at desc))[1]
    into v_n, v_first, v_last
  from metric_points
  where entity_id = p_entity and metric = p_metric and observed_at >= now() - v_window;

  if v_n < 2 then return null; end if;   -- Baseline only: never a fabricated variation
  insert into momentum_history(entity_id, metric, period, start_value, end_value, observations_count)
  values (p_entity, p_metric, p_period, v_first, v_last, v_n) returning id into v_id;
  return v_id;
end $$;
