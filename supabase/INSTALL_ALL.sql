-- INTENDEX — installation complète en un seul fichier (engine v0.1)
-- Coller en entier dans Supabase SQL Editor puis Run. Réexécutable sans risque.

-- ===================== supabase/migrations/0001_engine_core.sql =====================
-- =====================================================================
-- DREAMOTION INDEX ENGINE — core schema  (engine v0.1)
-- Vertical: Intendex (agent economy). Same migrations reusable for
-- Longevity Index, Discern… : one Supabase project per asset, same engine,
-- vertical-specific seeds only.
--
-- Data rules enforced here (from the MVP spec):
--   NO SOURCE      -> NO CLAIM           (source_id NOT NULL on every fact)
--   NO EVIDENCE    -> UNKNOWN            (tri-state, never "false" by default)
--   NO HISTORY     -> NO CHANGE CLAIM    (change events need an old value)
--   LOW CONFIDENCE -> DISCLOSE           (confidence on every fact/score)
--   Declared / Observed / Derived kept separate (evidence_level)
--   SCORE (state) and MOMENTUM (rate of change) kept separate (Alcyone rule)
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- enums ----------------------------------------------------
do $$ begin
  create type evidence_level  as enum ('declared','observed','derived');
  create type confidence_lvl  as enum ('high','medium','low');
  create type entity_status   as enum ('candidate','active','inactive','discontinued','merged');
  create type run_status      as enum ('running','success','partial','failed');
  create type bot_name        as enum ('discovery','verification','capability','pricing','change','scoring','manual');
exception when duplicate_object then null; end $$;

-- ---------- helpers --------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- engine config (one row per key) ---------------------------
create table if not exists engine_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 1. SOURCES — where every fact comes from (seeded from the Source Map)
-- =====================================================================
create table if not exists sources (
  id                      uuid primary key default gen_random_uuid(),
  code                    text unique not null,            -- SRC-001
  name                    text not null,
  url                     text,
  layer                   text,                            -- Registries & code, Pricing…
  family                  text,
  role                    text,                            -- Source / Competitor / Both / Standard
  priority                text check (priority in ('P0','P1','P2')),
  access                  text,                            -- Official API / HTML scraping…
  structured              text,
  refresh                 text,                            -- human description
  refresh_interval        interval,                        -- machine value for schedulers
  legal                   text,
  cost                    text,
  redistribution_allowed  boolean,                         -- null = unknown -> internal use only
  attribution_required    boolean not null default false,
  reliability             confidence_lvl not null default 'medium',
  is_active               boolean not null default false,  -- bots only use active sources
  notes                   text,
  evidence_url            text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
drop trigger if exists trg_sources_upd on sources;
create trigger trg_sources_upd before update on sources for each row execute function set_updated_at();

-- =====================================================================
-- 2. ENTITIES — one generic table for everything the index tracks
--    (agent, mcp_server, company, task, capability, protocol, model…)
-- =====================================================================
create table if not exists entity_types (
  code        text primary key,            -- agent, mcp_server, task…
  label       text not null,
  plural      text not null,
  url_prefix  text not null,               -- /agents, /tasks…  (SEO routes)
  is_listing  boolean not null default true, -- true = a thing on the market; false = taxonomy
  sort_order  int not null default 100
);

create table if not exists entities (
  id               uuid primary key default gen_random_uuid(),
  type             text not null references entity_types(code),
  slug             text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null,
  short_description text,
  description      text,
  website          text,
  status           entity_status not null default 'candidate',
  merged_into      uuid references entities(id),
  attributes       jsonb not null default '{}'::jsonb,  -- CURRENT normalised state (derived from observations)
  is_published     boolean not null default false,      -- public pages only for published rows
  confidence       confidence_lvl not null default 'low',
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search_tsv       tsvector generated always as (
                     setweight(to_tsvector('english', coalesce(name,'')), 'A') ||
                     setweight(to_tsvector('english', coalesce(short_description,'')), 'B') ||
                     setweight(to_tsvector('english', coalesce(description,'')), 'C')
                   ) stored,
  unique (type, slug),
  check (status <> 'merged' or merged_into is not null)
);
create index if not exists idx_entities_type_pub on entities(type, is_published);
create index if not exists idx_entities_tsv      on entities using gin(search_tsv);
create index if not exists idx_entities_name_trg on entities using gin(name gin_trgm_ops);
create index if not exists idx_entities_attrs    on entities using gin(attributes jsonb_path_ops);
drop trigger if exists trg_entities_upd on entities;
create trigger trg_entities_upd before update on entities for each row execute function set_updated_at();

-- Identifiers used to de-duplicate the same thing seen in several sources
-- (domain, github repo, npm package, MCP registry id, agent-card URL…)
create table if not exists entity_aliases (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references entities(id) on delete cascade,
  alias_type  text not null check (alias_type in
               ('domain','github_repo','npm','pypi','docker','mcp_registry','smithery','glama',
                'a2a_card_url','hf_space','product_hunt','crunchbase','name','other')),
  value       text not null,               -- normalised lower-case
  source_id   uuid references sources(id),
  created_at  timestamptz not null default now(),
  unique (alias_type, value)
);
create index if not exists idx_alias_entity on entity_aliases(entity_id);

-- Typed graph: TASK -> CAPABILITY -> AGENT -> TOOL -> PROTOCOL …
create table if not exists relation_types (
  code        text primary key,           -- has_capability, solves_task…
  label       text not null,
  from_type   text references entity_types(code),   -- null = any
  to_type     text references entity_types(code)
);

create table if not exists relations (
  id              uuid primary key default gen_random_uuid(),
  from_id         uuid not null references entities(id) on delete cascade,
  relation        text not null references relation_types(code),
  to_id           uuid not null references entities(id) on delete cascade,
  evidence_level  evidence_level not null,
  confidence      confidence_lvl not null default 'medium',
  source_id       uuid references sources(id),
  evidence        text,                    -- quote / field that justifies the link
  evidence_url    text,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  valid_to        timestamptz,             -- set when the link disappears (history kept)
  unique (from_id, relation, to_id, evidence_level),
  check (from_id <> to_id),
  -- NO SOURCE -> NO CLAIM (derived links are computed from other sourced facts)
  check (source_id is not null or evidence_level = 'derived')
);
create index if not exists idx_rel_to   on relations(to_id, relation) where valid_to is null;
create index if not exists idx_rel_from on relations(from_id, relation) where valid_to is null;

-- =====================================================================
-- 3. COLLECTION — bot runs, raw snapshots, atomic observations
-- =====================================================================
create table if not exists crawl_runs (                -- = data_refresh_log
  id             uuid primary key default gen_random_uuid(),
  bot            bot_name not null,
  source_id      uuid references sources(id),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         run_status not null default 'running',
  items_seen     int not null default 0,
  items_new      int not null default 0,
  items_changed  int not null default 0,
  errors         int not null default 0,
  llm_tokens     bigint not null default 0,
  cost_usd       numeric(10,4) not null default 0,
  log            jsonb not null default '{}'::jsonb
);
create index if not exists idx_runs_bot on crawl_runs(bot, started_at desc);

create table if not exists snapshots (                 -- raw evidence (file lives in Storage)
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references sources(id),
  entity_id     uuid references entities(id) on delete set null,
  run_id        uuid references crawl_runs(id) on delete set null,
  url           text not null,
  fetched_at    timestamptz not null default now(),
  http_status   int,
  content_type  text,
  content_hash  text not null,              -- sha256 -> skip unchanged pages
  storage_path  text,                       -- supabase storage key
  bytes         int
);
create index if not exists idx_snap_url on snapshots(url, fetched_at desc);
create index if not exists idx_snap_hash on snapshots(content_hash);

-- One fact = one row, append-only. field is a dotted path, e.g.
--   protocol.mcp , protocol.a2a , pricing.has_free_plan , open_source ,
--   github.stars , docs.url , human_approval , deployment.self_host
create table if not exists observations (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references entities(id) on delete cascade,
  field           text not null,
  value           jsonb not null,             -- JSON null is NOT allowed: unknown = no row
  evidence_level  evidence_level not null,
  confidence      confidence_lvl not null default 'medium',
  source_id       uuid not null references sources(id),   -- NO SOURCE -> NO CLAIM
  snapshot_id     uuid references snapshots(id) on delete set null,
  run_id          uuid references crawl_runs(id) on delete set null,
  evidence        text,
  evidence_url    text,
  extractor       text,                       -- e.g. 'regex', 'claude-haiku-4-5@prompt-v3'
  observed_at     timestamptz not null default clock_timestamp(),   -- first time this value was seen
  last_confirmed_at timestamptz not null default now(), -- last time a bot saw the same value again
  check (jsonb_typeof(value) <> 'null')
);
create index if not exists idx_obs_entity_field on observations(entity_id, field, observed_at desc);

-- Numeric time series used for MOMENTUM (stars, downloads, usage, uptime…)
create table if not exists metric_points (
  id           bigserial primary key,
  entity_id    uuid not null references entities(id) on delete cascade,
  metric       text not null,               -- github_stars, npm_downloads_week, uptime_30d…
  value        numeric not null,
  observed_at  timestamptz not null default now(),
  source_id    uuid not null references sources(id),
  run_id       uuid references crawl_runs(id) on delete set null,
  unique (entity_id, metric, observed_at)
);
create index if not exists idx_metric on metric_points(entity_id, metric, observed_at desc);

-- =====================================================================
-- 4. PRICES — append-only price history (Price Index raw material)
-- =====================================================================
create table if not exists price_points (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references entities(id) on delete cascade,
  plan_name       text not null,                 -- 'Free', 'Pro', 'Team', 'API'…
  billing_model   text not null check (billing_model in
                   ('free','subscription','usage','credits','seat','one_time','enterprise_quote','open_source')),
  amount          numeric(14,4),                 -- null only for enterprise_quote
  currency        char(3),
  interval        text check (interval in ('month','year','one_time','per_unit')),
  unit            text,                          -- 'seat', '1M input tokens', 'task', 'credit'…
  is_trial        boolean not null default false,
  evidence_level  evidence_level not null default 'observed',
  source_id       uuid not null references sources(id),
  snapshot_id     uuid references snapshots(id) on delete set null,
  evidence_url    text,
  observed_at     timestamptz not null default clock_timestamp(),
  last_confirmed_at timestamptz not null default now(),
  check (amount is not null or billing_model in ('enterprise_quote')),
  check (amount is null or currency is not null)
);
create index if not exists idx_price_entity on price_points(entity_id, plan_name, observed_at desc);

-- =====================================================================
-- 5. CHANGES / SIGNALS
-- =====================================================================
create table if not exists change_events (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references entities(id) on delete cascade,
  event_type      text not null check (event_type in
                   ('new_entity','field_changed','capability_added','capability_removed',
                    'price_increase','price_decrease','plan_added','plan_removed',
                    'protocol_added','protocol_removed','integration_added',
                    'went_offline','back_online','new_version','discontinued','score_changed')),
  field           text,
  old_value       jsonb,
  new_value       jsonb,
  source_id       uuid references sources(id),
  observation_id  uuid references observations(id) on delete set null,
  price_point_id  uuid references price_points(id) on delete set null,
  confidence      confidence_lvl not null default 'medium',
  importance      smallint not null default 1 check (importance between 1 and 5),
  is_published    boolean not null default false,
  detected_at     timestamptz not null default clock_timestamp(),
  -- NO HISTORY -> NO CHANGE CLAIM : a "change" needs a previous value
  check (event_type in ('new_entity','plan_added','protocol_added','capability_added',
                        'integration_added','new_version','went_offline','discontinued')
         or old_value is not null)
);
create index if not exists idx_events_time   on change_events(detected_at desc) where is_published;
create index if not exists idx_events_entity on change_events(entity_id, detected_at desc);

-- =====================================================================
-- 6. SCORES — methodology-versioned; SCORE and MOMENTUM kept separate
-- =====================================================================
create table if not exists methodologies (
  code         text not null,                 -- agent_score, agent_price_index…
  version      text not null,                 -- '1.0'
  label        text not null,
  weights      jsonb not null,                -- {"capability":25,…}
  description  text,
  published_at timestamptz,
  is_current   boolean not null default false,
  primary key (code, version)
);
create unique index if not exists uq_methodology_current on methodologies(code) where is_current;

-- Same columns as Alcyone score_history (+ entity_id, components)
create table if not exists score_history (
  id                   uuid primary key default gen_random_uuid(),
  entity_id            uuid references entities(id) on delete cascade,  -- null = market-level score
  score_type           text not null,               -- agent_score, capability, integration…
  score                numeric(6,2) not null check (score between 0 and 100),
  date                 date not null default current_date,
  period               text not null default 'daily',
  methodology_code     text not null,
  methodology_version  text not null,
  source_count         int not null default 0,
  confidence           confidence_lvl not null,
  components           jsonb not null default '{}'::jsonb,  -- sub-scores + missing data
  notes                text,
  calculated_at        timestamptz not null default now(),
  foreign key (methodology_code, methodology_version) references methodologies(code, version)
);
create unique index if not exists uq_score_day
  on score_history(coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid), score_type, date, methodology_version);

create table if not exists momentum_history (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid references entities(id) on delete cascade,
  metric             text not null,
  period             text not null,               -- 7d, 30d, 90d
  start_value        numeric not null,
  end_value          numeric not null,
  abs_change         numeric generated always as (end_value - start_value) stored,
  pct_change         numeric generated always as
                       (case when start_value = 0 then null
                             else round((end_value - start_value) / abs(start_value) * 100, 2) end) stored,
  observations_count int not null check (observations_count >= 2),  -- never a fake variation
  computed_at        timestamptz not null default now()
);

-- Market indexes: Agent Economy Price Index, Supply Index…
create table if not exists index_values (
  index_code           text not null,
  date                 date not null,
  value                numeric(12,4) not null,
  base_date            date not null,
  constituents_count   int not null,
  methodology_version  text not null,
  confidence           confidence_lvl not null,
  notes                text,
  primary key (index_code, date)
);

-- =====================================================================
-- 7. OPERATIONS & DEMAND (intent = the future ad-network asset)
-- =====================================================================
create table if not exists review_queue (          -- admin: what a human should look at
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid references entities(id) on delete cascade,
  reason      text not null,                        -- possible_duplicate, low_confidence, new_candidate…
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'open' check (status in ('open','accepted','rejected','done')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists search_queries (        -- "What do you need an AI agent to do?"
  id                 bigserial primary key,
  query              text not null,
  parsed             jsonb not null default '{}'::jsonb,   -- {task, requirements, capabilities}
  matched_task_id    uuid references entities(id) on delete set null,
  results_count      int,
  channel            text not null default 'web' check (channel in ('web','api','mcp','agent')),
  created_at         timestamptz not null default now()
  -- no IP, no user id: aggregated intent only
);
create index if not exists idx_queries_task on search_queries(matched_task_id, created_at desc);

create table if not exists outbound_clicks (
  id          bigserial primary key,
  entity_id   uuid not null references entities(id) on delete cascade,
  page_path   text not null,
  target      text not null default 'website' check (target in ('website','pricing','docs','affiliate','sponsored')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_clicks_entity on outbound_clicks(entity_id, created_at desc);

-- ===================== supabase/migrations/0002_engine_functions.sql =====================
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

-- ===================== supabase/migrations/0003_scoring_views_security.sql =====================
-- =====================================================================
-- DREAMOTION INDEX ENGINE — scoring, public views, security  (engine v0.1)
-- =====================================================================

-- ---------------------------------------------------------------------
-- compute_agent_score : transparent score from OBSERVABLE data only.
-- Missing data scores 0 on that component AND lowers confidence; the
-- list of missing components is stored so pages can say "not documented".
-- Weights come from methodologies (code 'agent_score', is_current).
-- ---------------------------------------------------------------------
create or replace function compute_agent_score(p_entity uuid) returns uuid language plpgsql as $$
declare
  m        methodologies%rowtype;
  e        entities%rowtype;
  c        jsonb := '{}'::jsonb;     -- component scores 0-100
  missing  text[] := '{}';
  n_caps int; n_int int; n_proto int; n_src int;
  has_price boolean; has_quote boolean;
  total numeric := 0; wsum numeric := 0; known_w numeric := 0;
  k text; w numeric; v_conf confidence_lvl; v_id uuid;
begin
  select * into m from methodologies where code = 'agent_score' and is_current;
  if not found then raise exception 'No current agent_score methodology'; end if;
  select * into e from entities where id = p_entity;

  -- capability: documented capabilities (8+ = full marks)
  select count(*) into n_caps from relations
   where from_id = p_entity and relation = 'has_capability' and valid_to is null;
  c := c || jsonb_build_object('capability', round(least(n_caps / 8.0, 1) * 100, 1));
  if n_caps = 0 then missing := array_append(missing, 'capability'); end if;

  -- integration: protocols (api/mcp/a2a/sdk/webhook) + integrations
  select count(*) into n_proto from jsonb_each(e.attributes) a
   where a.key like 'protocol.%' and a.value->'value' = 'true'::jsonb;
  select count(*) into n_int from relations
   where from_id = p_entity and relation = 'integrates_with' and valid_to is null;
  c := c || jsonb_build_object('integration', round(least((n_proto + n_int / 5.0) / 4.0, 1) * 100, 1));
  if n_proto = 0 and n_int = 0 then missing := array_append(missing, 'integration'); end if;

  -- documentation: public docs + llms.txt
  c := c || jsonb_build_object('documentation',
        (case when e.attributes ? 'docs.url' then 70 else 0 end) +
        (case when (e.attributes->'llms_txt'->'value') = 'true'::jsonb then 30 else 0 end));
  if not (e.attributes ? 'docs.url') then missing := array_append(missing, 'documentation'); end if;

  -- pricing transparency
  select exists(select 1 from price_points where entity_id = p_entity and amount is not null),
         exists(select 1 from price_points where entity_id = p_entity and billing_model = 'enterprise_quote')
    into has_price, has_quote;
  c := c || jsonb_build_object('pricing',
        case when has_price then 100 when has_quote then 40 else 0 end);
  if not has_price and not has_quote then missing := array_append(missing, 'pricing'); end if;

  -- transparency: company known, open-source status known, website known
  c := c || jsonb_build_object('transparency',
        (case when exists(select 1 from relations where from_id = p_entity and relation = 'made_by') then 40 else 0 end) +
        (case when e.attributes ? 'open_source' then 30 else 0 end) +
        (case when e.website is not null then 30 else 0 end));

  -- freshness: age of last observed verification
  c := c || jsonb_build_object('freshness', case
        when e.last_verified_at is null then 0
        when e.last_verified_at > now() - interval '7 days'  then 100
        when e.last_verified_at > now() - interval '30 days' then 70
        when e.last_verified_at > now() - interval '90 days' then 40
        else 10 end);
  if e.last_verified_at is null then missing := array_append(missing, 'freshness'); end if;

  -- human oversight: documented approval / human-in-the-loop controls
  c := c || jsonb_build_object('human_oversight',
        case when (e.attributes->'human_approval'->'value') = 'true'::jsonb then 100 else 0 end);
  if not (e.attributes ? 'human_approval') then missing := array_append(missing, 'human_oversight'); end if;

  -- reliability: only from our own probes (uptime metric); weight 0 in v1.0
  c := c || jsonb_build_object('reliability', coalesce((
        select least(value, 100) from metric_points
         where entity_id = p_entity and metric = 'uptime_30d'
         order by observed_at desc limit 1), 0));

  for k, w in select key, value::numeric from jsonb_each_text(m.weights) loop
    wsum  := wsum + w;
    total := total + coalesce((c->>k)::numeric, 0) * w;
    if w > 0 and not (k = any(missing)) then known_w := known_w + w; end if;
  end loop;

  v_conf := case when known_w / nullif(wsum,0) >= 0.8 then 'high'
                 when known_w / nullif(wsum,0) >= 0.5 then 'medium' else 'low' end;

  select count(distinct s) into n_src from (
    select source_id s from observations where entity_id = p_entity
    union select source_id from price_points where entity_id = p_entity
    union select source_id from relations where from_id = p_entity and source_id is not null) x;

  insert into score_history(entity_id, score_type, score, date, period, methodology_code,
                            methodology_version, source_count, confidence, components)
  values (p_entity, 'agent_score', round(total / nullif(wsum,0), 2), current_date, 'daily',
          m.code, m.version, n_src, v_conf,
          jsonb_build_object('components', c, 'missing', to_jsonb(missing), 'weights', m.weights))
  on conflict (coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid), score_type, date, methodology_version)
  do update set score = excluded.score, confidence = excluded.confidence,
                components = excluded.components, source_count = excluded.source_count,
                calculated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- search : "What do you need an AI agent to do?"  (full-text + fuzzy)
-- ---------------------------------------------------------------------
create or replace function search_entities(p_q text, p_type text default null, p_limit int default 20)
returns table(id uuid, type text, slug text, name text, short_description text, rank real)
language sql stable as $$
  select e.id, e.type, e.slug, e.name, e.short_description,
         (ts_rank(e.search_tsv, websearch_to_tsquery('english', p_q)) * 2
          + similarity(e.name, p_q))::real as rank
  from entities e
  where e.is_published
    and (p_type is null or e.type = p_type)
    and (e.search_tsv @@ websearch_to_tsquery('english', p_q) or similarity(e.name, p_q) > 0.6)
  order by rank desc
  limit p_limit
$$;

-- ---------------------------------------------------------------------
-- PUBLIC VIEWS (security_invoker: RLS of the caller applies)
-- ---------------------------------------------------------------------
create or replace view v_current_prices with (security_invoker = true) as
select distinct on (p.entity_id, lower(p.plan_name))
       p.entity_id, p.plan_name, p.billing_model, p.amount, p.currency, p.interval, p.unit,
       p.is_trial, p.evidence_level, p.observed_at, p.last_confirmed_at, s.name as source_name
from price_points p join sources s on s.id = p.source_id
order by p.entity_id, lower(p.plan_name), p.observed_at desc;

create or replace view v_latest_scores with (security_invoker = true) as
select distinct on (entity_id, score_type)
       entity_id, score_type, score, confidence, methodology_code, methodology_version,
       source_count, components, date
from score_history
where entity_id is not null
order by entity_id, score_type, date desc, calculated_at desc;

-- Agent card used by listing pages, comparisons and the API
create or replace view v_agents with (security_invoker = true) as
select e.id, e.slug, e.name, e.short_description, e.website, e.status,
       e.last_verified_at, e.confidence as data_confidence,
       (select string_agg(c.name, ', ' order by c.name) from relations r join entities c on c.id = r.to_id
         where r.from_id = e.id and r.relation = 'in_category' and r.valid_to is null) as categories,
       (select c.name from relations r join entities c on c.id = r.to_id
         where r.from_id = e.id and r.relation = 'made_by' and r.valid_to is null limit 1) as company,
       e.attributes->'protocol.api'->'value'  as api,   -- true / false / null(=unknown)
       e.attributes->'protocol.mcp'->'value'  as mcp,
       e.attributes->'protocol.a2a'->'value'  as a2a,
       e.attributes->'open_source'->'value'   as open_source,
       (select min(amount) from v_current_prices p where p.entity_id = e.id
         and p.interval = 'month' and p.currency = 'USD' and p.amount > 0) as from_usd_month,
       exists(select 1 from v_current_prices p where p.entity_id = e.id and p.billing_model in ('free','open_source')) as has_free,
       s.score as agent_score, s.confidence as score_confidence, s.methodology_version
from entities e
left join v_latest_scores s on s.entity_id = e.id and s.score_type = 'agent_score'
where e.type = 'agent' and e.is_published and e.status = 'active';

-- TASK -> CAPABILITY -> AGENT : the decision-engine core.
-- coverage = share of the task's required capabilities the agent documents.
create or replace view v_task_matches with (security_invoker = true) as
with req as (
  select r.from_id as task_id, r.to_id as capability_id
  from relations r where r.relation = 'requires_capability' and r.valid_to is null
), n as (select task_id, count(*) as n_req from req group by task_id)
select t.id as task_id, t.slug as task_slug, a.id as agent_id, a.slug as agent_slug, a.name as agent_name,
       count(distinct req.capability_id) as matched, n.n_req,
       round(count(distinct req.capability_id)::numeric / n.n_req * 100) as coverage_pct,
       bool_or(direct.id is not null) as declared_for_task
from req
join n on n.task_id = req.task_id
join entities t on t.id = req.task_id
join relations ac on ac.to_id = req.capability_id and ac.relation = 'has_capability' and ac.valid_to is null
join entities a on a.id = ac.from_id and a.type = 'agent' and a.is_published
left join relations direct on direct.from_id = a.id and direct.to_id = t.id
                           and direct.relation = 'solves_task' and direct.valid_to is null
group by t.id, t.slug, a.id, a.slug, a.name, n.n_req;

create or replace view v_signals with (security_invoker = true) as
select ev.id, ev.detected_at, ev.event_type, ev.field, ev.old_value, ev.new_value, ev.importance,
       e.type as entity_type, e.slug as entity_slug, e.name as entity_name, s.name as source_name
from change_events ev
join entities e on e.id = ev.entity_id
left join sources s on s.id = ev.source_id
where ev.is_published and e.is_published;

-- ---------------------------------------------------------------------
-- SECURITY — Supabase: anon/authenticated read published data only,
-- bots write with the service_role key (bypasses RLS). Nothing else.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['engine_config','sources','entity_types','entities','entity_aliases',
    'relation_types','relations','crawl_runs','snapshots','observations','metric_points',
    'price_points','change_events','methodologies','score_history','momentum_history',
    'index_values','review_queue','search_queries','outbound_clicks']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists pub_read on entity_types;      create policy pub_read on entity_types     for select using (true);
drop policy if exists pub_read on relation_types;    create policy pub_read on relation_types   for select using (true);
drop policy if exists pub_read on methodologies;     create policy pub_read on methodologies    for select using (published_at is not null);
drop policy if exists pub_read on index_values;      create policy pub_read on index_values     for select using (true);
drop policy if exists pub_read on sources;           create policy pub_read on sources          for select using (is_active);
drop policy if exists pub_read on entities;          create policy pub_read on entities         for select using (is_published);
drop policy if exists pub_read on relations;         create policy pub_read on relations        for select using (
  valid_to is null
  and exists (select 1 from entities a where a.id = from_id and a.is_published)
  and exists (select 1 from entities b where b.id = to_id   and b.is_published));
drop policy if exists pub_read on price_points;      create policy pub_read on price_points     for select using (
  exists (select 1 from entities e where e.id = entity_id and e.is_published));
drop policy if exists pub_read on observations;      create policy pub_read on observations     for select using (
  exists (select 1 from entities e where e.id = entity_id and e.is_published));
drop policy if exists pub_read on metric_points;     create policy pub_read on metric_points    for select using (
  exists (select 1 from entities e where e.id = entity_id and e.is_published));
drop policy if exists pub_read on score_history;     create policy pub_read on score_history    for select using (
  entity_id is null or exists (select 1 from entities e where e.id = entity_id and e.is_published));
drop policy if exists pub_read on momentum_history;  create policy pub_read on momentum_history for select using (
  entity_id is null or exists (select 1 from entities e where e.id = entity_id and e.is_published));
drop policy if exists pub_read on change_events;     create policy pub_read on change_events    for select using (is_published);
-- internal only (no policy = no access for anon/authenticated):
--   engine_config, entity_aliases, crawl_runs, snapshots, review_queue, search_queries, outbound_clicks

-- functions that write are for the service role only
revoke execute on function resolve_entity(text,text,jsonb,text,text,text) from public, anon, authenticated;
revoke execute on function record_observation(uuid,text,jsonb,evidence_level,text,confidence_lvl,text,text,text,uuid,uuid) from public, anon, authenticated;
revoke execute on function record_price(uuid,text,text,numeric,text,text,text,text,boolean,text,uuid,evidence_level) from public, anon, authenticated;
revoke execute on function link(uuid,text,uuid,evidence_level,text,confidence_lvl,text,text) from public, anon, authenticated;
revoke execute on function record_metric(uuid,text,numeric,text,timestamptz) from public, anon, authenticated;
revoke execute on function compute_momentum(uuid,text,text) from public, anon, authenticated;
revoke execute on function compute_agent_score(uuid) from public, anon, authenticated;

-- ===================== supabase/seed/0100_sources.sql =====================
-- Generated by scripts/build_seeds.py from data/source_map.csv — do not edit by hand
-- 85 sources from the Source Map + 2 internal sources.
insert into sources(code,name,url,layer,family,role,priority,access,structured,refresh,refresh_interval,legal,cost,redistribution_allowed,attribution_required,is_active,notes,evidence_url) values
('SRC-000','Dreamotion editorial curation',null,'Internal','Manual','Source','P0','Manual','yes','on demand',null,'own data','free',true,false,true,'Taxonomy, manual verification, corrections',null),
('SRC-900','Intendex probes (own observations)',null,'Internal','Probe','Source','P0','Own crawler','yes','daily','1 day','own data','free',true,false,true,'Agent-card probes, uptime checks, pricing snapshots made by our bots',null),
('SRC-001','Official MCP Registry','https://registry.modelcontextprotocol.io','Registries & code','MCP registry','Source','P0','Official API','yes','daily full crawl (cursor), hourly incremental via updated_since','1 hour'::interval,'API ToS allows — open community registry (LF project), public unauthenticated API; repo license file not verified in detail','free',true,false,true,'Canonical seed; API frozen at v0.1 (preview, no breaking changes since Oct 2025). Versioned entries => native change history. Downstream registries (GitHub, Azure MCP Center, PulseMCP) mirror it. | Also: Canonical upstream for MCP - ingest first','https://github.com/modelcontextprotocol/registry'),
('SRC-002','Glama MCP Directory','https://glama.ai/mcp/servers','Registries & code','MCP registry','Both','P0','Official API','yes','daily','1 day'::interval,'API ToS restricts — commercial data license; bearer API key required; mandatory visible Glama credit + backlink on every view; 100 req/s/IP; waiver possible for internal tools','rate-limited free (API key); commercial terms apply',false,true,false,'Richest aggregated metadata (tool lists + popularity). Legal attribution clause makes it risky as a public-display source; use for internal enrichment/dedup unless license negotiated. | Also: Hosts Agentery and Wellknown connectors; uptime tests per connector','https://glama.ai/mcp/reference'),
('SRC-003','Smithery Registry','https://smithery.ai','Registries & code','MCP registry','Both','P0','Official API','yes','daily','1 day'::interval,'API ToS allows with API key (Bearer); redistribution terms unverified','rate-limited free (API key)',null,false,true,'useCount is a proprietary usage signal — snapshot daily to build a usage time series nobody publishes historically. | Also: Usage counts = real demand signal','https://smithery.ai/docs/concepts/registry_search_servers'),
('SRC-004','PulseMCP','https://www.pulsemcp.com/servers','Registries & code','MCP registry','Source','P1','Official API','yes','daily','1 day'::interval,'unclear — Sub-Registry API v0.1 (MCP-registry compatible) exists; robots.txt blocked our fetcher; API access terms unverified','unverified (API may require partner key)',null,false,false,'Curated sub-registry of the official registry; good for classification official vs community. Check ToS/robots before crawling HTML.','https://www.pulsemcp.com/api/docs/v0.1'),
('SRC-005','Awesome MCP Servers (punkpeye) + mcpservers.org','https://github.com/punkpeye/awesome-mcp-servers','Registries & code','MCP registry','Source','P1','HTML scraping','partial','daily (git diff of README)','1 day'::interval,'open license — repo MIT; mcpservers.org site terms not found (unclear)','free',null,false,false,'Parse README markdown from git (not HTML) — git history gives dated additions since Nov 2024 (free historical backfill).','https://www.star-history.com/punkpeye/awesome-mcp-servers/'),
('SRC-006','mcp.so','https://mcp.so','Registries & code','MCP registry','Source','P2','Sitemap + HTML','partial','weekly','7 days'::interval,'unclear — ToS at /terms-of-service not reviewed; no public API','free',null,false,false,'Community directory, submissions via GitHub; mostly overlaps official registry/GitHub. Use only for gap-filling.','https://mcp.so/'),
('SRC-007','Docker MCP Catalog (docker/mcp-registry + Docker Hub mcp/ namespace)','https://hub.docker.com/mcp','Registries & code','MCP registry','Source','P1','Official API','yes','daily (git) / weekly (Hub pull counts)','1 day'::interval,'open license — docker/mcp-registry is MIT; Docker Hub API subject to Docker ToS + rate limits','free (Hub API rate-limited)',null,false,false,'Curated + signed images = high-trust verified tier; Hub pull_count gives adoption signal over time.','https://docs.docker.com/ai/mcp-catalog-and-toolkit/catalog/'),
('SRC-008','GitHub MCP Registry (github.com/mcp)','https://github.com/mcp','Registries & code','MCP registry','Source','P2','HTML scraping','partial','weekly','7 days'::interval,'ToS restricts scraping (GitHub ToS); but data mirrors official registry','free',null,false,false,'Downstream of official registry — use as ''curated/featured by GitHub'' flag rather than a discovery source.','https://github.blog/ai-and-ml/generative-ai/how-to-find-install-and-manage-mcp-servers-with-the-github-mcp-registry/'),
('SRC-009','modelcontextprotocol/servers (GitHub)','https://github.com/modelcontextprotocol/servers','Registries & code','MCP registry','Source','P2','Official API','partial','weekly','7 days'::interval,'open license — Apache-2.0 (new) / MIT (existing)','free',null,false,false,'No longer a community list; git history useful only for early-ecosystem backfill (2024-2025).','https://github.com/modelcontextprotocol/servers'),
('SRC-010','A2A Agent Card (/.well-known/agent-card.json)','https://a2a-protocol.org/latest/topics/agent-discovery/','Registries & code','A2A / agent card','Source','P0','Well-known file','yes','daily for known endpoints; weekly domain sweep','1 day'::interval,'open — public file intended for discovery (RFC 8615); respect robots/rate limits','free',true,false,true,'Spec path is agent-card.json (older agent.json still seen — probe both). Spec does not standardize a registry API, so our crawled card history is original data.','https://a2a-protocol.org/latest/topics/agent-discovery/'),
('SRC-011','A2A Registry (a2aregistry.org)','https://a2aregistry.org','Registries & code','A2A / agent card','Source','P0','Official API','yes','daily','1 day'::interval,'unclear — open-source GitHub project (prassanna-ravishankar/a2a-registry), license not verified; API docs at /api/docs (Swagger)','free',null,false,true,'Small but the best public seed list of live A2A endpoints; other community ''A2A registries'' exist (a2a-registry.org, GlobalA2ARegistry) — volumes unverified. | Also: Small but clean A2A seed','https://a2aregistry.org/'),
('SRC-012','Google Cloud Marketplace AI agents / Gemini Enterprise Agent Gallery','https://cloud.google.com/marketplace','Registries & code','Platform agent store','Source','P2','HTML scraping','partial','weekly','7 days'::interval,'ToS restricts scraping (Google ToS); no public buyer catalog API found','free',null,false,false,'A2A listings require an Agent Card → vendor card URLs can be verified directly via the well-known-file bot.','https://docs.cloud.google.com/marketplace/docs/partners/ai-agents'),
('SRC-013','AWS Marketplace — AI Agents & Tools (Discovery API)','https://aws.amazon.com/marketplace','Registries & code','Platform agent store','Source','P1','Official API','yes','daily (pricing), weekly (catalog)','1 day'::interval,'API ToS allows — Discovery API (launched Apr 2026) via AWS SDK with IAM; redistribution of pricing data: check AWS Service Terms (unverified)','rate-limited free (AWS account required; API pricing unverified)',null,false,false,'Only major marketplace with an official programmatic catalog+pricing API → best structured pricing feed for agents.','https://aws.amazon.com/about-aws/whats-new/2026/04/aws-marketplace-discovery-api'),
('SRC-014','Salesforce AgentExchange','https://agentexchange.salesforce.com','Registries & code','Platform agent store','Source','P2','HTML scraping','partial','weekly','7 days'::interval,'ToS restricts scraping (Salesforce site ToS); no public API found','free',null,false,false,'Enterprise signal (ratings/reviews over time). Filter to agent/MCP types only.','https://salesforcedevops.net/index.php/2026/04/14/agentexchange-salesforces-bet-that-trust-can-scale-with-agentic-speed/'),
('SRC-015','Microsoft Agent Store (M365 Copilot) + Foundry Tools Catalog / Azure MCP Center','https://ai.azure.com/catalog/tools','Registries & code','Platform agent store','Source','P2','HTML scraping','partial','weekly','7 days'::interval,'ToS restricts scraping (Microsoft ToS); Foundry tools catalog backed by Azure API Center registry (API for own tenant only)','free',null,false,false,'Enterprise distribution flag (''available in Microsoft ecosystem''); low volume visibility without tenant access.','https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-agent-store'),
('SRC-016','OpenAI ChatGPT App Directory (+ GPT Store)','https://chatgpt.com/apps','Registries & code','Platform agent store','Source','P1','HTML scraping','partial','weekly','7 days'::interval,'ToS restricts scraping (OpenAI Terms prohibit automated extraction); no public listing API','free',null,false,false,'Apps SDK apps are MCP servers — cross-link to registry entries. Prefer community mirror / vendor pages to reduce ToS risk.','https://github.com/rdmgator12/awesome-chatgpt-apps'),
('SRC-017','Anthropic Claude Connectors Directory','https://claude.com/connectors','Registries & code','Platform agent store','Source','P1','HTML scraping','partial','weekly','7 days'::interval,'unclear — no public API; Anthropic ToS applies to scraping','free',null,false,false,'Listing = strong ''vetted remote MCP'' signal; remote URLs can be verified by our MCP handshake bot.','https://github.com/rdmgator12/awesome-claude-connectors'),
('SRC-018','GitHub REST/GraphQL API (topics, search, repo stats, releases)','https://docs.github.com/en/rest','Registries & code','Code & packages','Source','P0','Official API','yes','daily (stars/releases), hourly for top N','1 hour'::interval,'API ToS allows — GitHub API terms; code licenses per repo; mass scraping of HTML restricted','rate-limited free (5,000 req/h authenticated; search 30 req/min)',true,false,true,'Core signal layer; daily star/commit snapshots build the historical ''market cap'' proxy. GH Archive (BigQuery) can backfill history. | Also: Star velocity (WatchEvent/day) back-fillable for years = trend index for open-source agents/frameworks. GitHub Trending page has no API (HTML only) - compute our own from GH Archive.','https://github.com/topics/mcp-server'),
('SRC-019','npm Registry API + downloads API','https://registry.npmjs.org','Registries & code','Code & packages','Source','P0','Official API','yes','daily (downloads), changes feed near-real-time','1 day'::interval,'API ToS allows — public registry; package contents under own licenses','free (rate-limited)',true,false,true,'Daily download series per package = adoption time series; version publishes = change events. Also indexes n8n community nodes (keyword n8n-community-node-package). | Also: Adoption index for agent SDKs/frameworks (langchain, crewai, autogen, openai-agents, MCP servers). BigQuery allows multi-year backfill.','https://registry.npmjs.org/-/v1/search?text=keywords:mcp&size=1'),
('SRC-020','PyPI JSON API + BigQuery public datasets','https://docs.pypi.org/api/bigquery/','Registries & code','Code & packages','Source','P0','Bulk dump/dataset','yes','daily','1 day'::interval,'open license — BigQuery datasets CC-BY 4.0; JSON API public','free JSON API; BigQuery = paid per query beyond free tier',true,false,true,'WARNING: PyPI changed download counting on 2026-08-24 (only .whl/.tar.gz/.zip; prior totals ~39% inflated) → series discontinuity; normalize. Find MCP servers via requires_dist containing ''mcp''.','https://blog.pypi.org/posts/2026-08-31-download-counts/'),
('SRC-021','Hugging Face Hub API (Spaces with MCP badge, agents)','https://huggingface.co/spaces?filter=mcp-server','Registries & code','Code & packages','Source','P1','Official API','yes','daily','1 day'::interval,'API ToS allows — public Hub API; per-Space licenses','rate-limited free',null,false,false,'Gradio Spaces with mcp_server=True auto-badged; endpoints are live and testable (but often sleep). | Also: DeepNLP publishes agent-directory datasets on HF (licenses vary) | Also: Discovery of open-source agents/spaces (tag filters) + adoption metric (downloads/likes deltas).','https://huggingface.co/docs/hub/spaces-mcp-servers'),
('SRC-022','llms.txt (well-known convention)','https://llmstxt.org','Registries & code','API directory','Source','P1','Well-known file','partial','weekly','7 days'::interval,'open — public file intended for LLM consumption','free',null,false,false,'Use on known company domains to locate docs/pricing/MCP pages; presence itself is an ''agent-readiness'' signal.','https://www.rankability.com/data/llms-txt-adoption/'),
('SRC-023','APIs.guru OpenAPI Directory','https://github.com/APIs-guru/openapi-directory','Registries & code','API directory','Source','P2','Bulk dump/dataset','yes','weekly','7 days'::interval,'open license — CC0-1.0 for contributed definitions; fair use for others','free',null,false,false,'Tool/API layer for agents; stale-ish. Git history = free change backfill.','https://github.com/APIs-guru/openapi-directory'),
('SRC-024','Postman API Network (incl. MCP servers section)','https://www.postman.com/explore/mcp-servers','Registries & code','API directory','Source','P2','HTML scraping','partial','monthly','30 days'::interval,'ToS restricts scraping (Postman ToS)','free',null,false,false,'Postman ''getmcp'' workspaces list official MCP servers — useful as vendor-verified cross-check.','https://www.postman.com/getmcp'),
('SRC-025','RapidAPI Hub (Nokia)','https://rapidapi.com/hub','Registries & code','API directory','Source','P2','HTML scraping','partial','monthly','30 days'::interval,'ToS restricts scraping; owned by Nokia since Nov 2024 (refocused on network APIs)','free',null,false,false,'Only public source with per-API pricing tiers + latency; strategic uncertainty after Nokia acquisition.','https://techcrunch.com/2024/11/13/nokia-acquires-rapid-the-api-company-once-valued-at-1b/'),
('SRC-026','Zapier App Directory','https://zapier.com/apps','Registries & code','Integration directory','Source','P2','Sitemap + HTML','partial','monthly','30 days'::interval,'ToS restricts scraping (Zapier ToS)','free',null,false,false,'Maps which SaaS an agent can act on via Zapier MCP; use as capability dictionary rather than discovery.','https://en.wikipedia.org/wiki/Zapier'),
('SRC-027','n8n Integrations (core nodes + community nodes on npm)','https://n8n.io/integrations','Registries & code','Integration directory','Source','P2','Official API','yes','weekly','7 days'::interval,'open — community nodes via public npm registry; n8n site ToS for HTML','free',null,false,false,'Harvest via npm keyword n8n-community-node-package (no scraping needed). Make.com app directory: volume/API unverified — not included.','https://vps.us/blog/how-many-n8n-integrations/'),
('SRC-028','LangChain Hub / LangSmith prompt hub','https://smith.langchain.com/hub','Registries & code','Integration directory','Source','P2','HTML scraping','partial','monthly','30 days'::interval,'unclear','free',null,false,false,'Low value for agent index; deprioritize. CrewAI tools/marketplace: no public catalog verified.','https://github.com/langchain-ai/docs/issues/2558'),
('SRC-029','Agentic Index','https://agenticindex.io/','Competitors & directories','Competitor index','Competitor','P0','Sitemap + HTML','partial','Data ''last verified 2026-09-22''; public changelog (entries 18 & 23 Sep 2026)',null,'No public API seen; ToS not reviewed - treat as reference only','Free to read',false,false,false,'Closest to an analyst-grade vendor scorecard (enterprise agent platforms), not a market-data index; no live endpoint checks','https://agenticindex.io/'),
('SRC-030','The Agents Index','https://theagentsindex.com/','Competitors & directories','Directory','Competitor','P2','Sitemap + HTML','partial','Per-listing verification date; all re-checked within 90 days','1 day'::interval,'No API; ToS not reviewed','Free',null,false,false,'Small hand-researched set; also publishes ''AI Agent Pricing in 2026'' guide','https://theagentsindex.com/'),
('SRC-031','Wellknown','https://wellknown.network/','Competitors & directories','Competitor index','Both','P0','Official API','yes','Most sources every 8-9 min; A2A agent cards ~5h',null,'Free search + premium API tiers; API ToS not reviewed - check before redistribution','Free tier / paid API (prices not published on homepage)',false,false,true,'Aggregates 9 sources (Official MCP Registry ~36k, PyPI ~19k, npm ~16k); ships MCP server + ''resolve'' API','https://wellknown.network/'),
('SRC-032','Agenstry','https://agenstry.com/','Competitors & directories','Competitor index','Both','P0','HTML scraping','partial','Continuous monitoring; daily Merkle-hash transparency root','1 day'::interval,'API/export terms not verified','Free tools + paid tiers (pricing page)',false,false,true,'Only competitor observed tracking on-chain payment flows to agents - very close to a ''CoinMarketCap'' angle','https://agenstry.com/'),
('SRC-033','Agentery','https://www.agentery.com/aepi','Competitors & directories','Competitor index','Competitor','P0','Official API','yes','Daily price scan','1 day'::interval,'MCP + REST API offered; terms not reviewed. Homepage blocked our proxy (403)','Free profiles; commercial terms not disclosed',false,false,false,'Most direct ''market data'' competitor: already publishes a price index; site mentions a YC listing (not verified)','https://www.agentery.com/aepi'),
('SRC-034','There''s An AI For That','https://theresanaiforthat.com/','Competitors & directories','Directory','Both','P1','HTML scraping','partial','Daily additions','1 day'::interval,'No public API; scraping likely prohibited by ToS - reference/link only','n/a',null,false,false,'Biggest consumer AI directory; traffic moat, weak on live/agent data','https://theresanaiforthat.com/'),
('SRC-035','Futurepedia','https://www.futurepedia.io/','Competitors & directories','Directory','Competitor','P2','HTML scraping','partial','unverified',null,'No API; affiliate links disclosed; scraping not advised','n/a',null,false,false,'Pivoting to education; low relevance','https://www.futurepedia.io/'),
('SRC-036','AI Agents Directory','https://aiagentsdirectory.com/','Competitors & directories','Directory','Both','P1','HTML scraping','partial','Continuous submissions; news dated 2026-09-25',null,'No API seen; ToS not reviewed','n/a',null,false,false,'Largest agent-specific curated directory checked','https://aiagentsdirectory.com/'),
('SRC-037','AI Agent Store (+ Claw Earn)','https://aiagentstore.ai/','Competitors & directories','Marketplace','Both','P1','Official API','partial','unverified',null,'Developer docs/APIs mentioned (Claw Earn); directory terms not reviewed','n/a',null,false,false,'Combines directory with a paid-task marketplace - source of real transaction signals','https://aiagentstore.ai/claw-earn'),
('SRC-038','agent.ai','https://agent.ai/','Competitors & directories','Marketplace','Competitor','P2','None (reference only)','no','unverified',null,'n/a','n/a',null,false,false,'Redirect may be temporary or bot-specific; re-check manually before citing as active','https://www.builderpack.com/'),
('SRC-039','Toolify','https://www.toolify.ai/','Competitors & directories','Directory','Both','P1','HTML scraping','partial','Daily (states updated daily)','1 day'::interval,'No API; ToS not reviewed; sells guest posts','n/a',null,false,false,'Publishes traffic-based rankings - a proxy signal','https://www.toolify.ai/'),
('SRC-040','Product Hunt','https://api.producthunt.com/v2/docs','Competitors & directories','Directory','Source','P1','Official API','yes','Daily launches','1 day'::interval,'GraphQL API v2 with rate limits; commercial use needs Product Hunt approval per their API terms (verify)','Free (non-commercial)',false,false,false,'Best launch-signal feed for new agents | Also: Best launch-event feed for agents. Request commercial exception before launch; meanwhile use for internal discovery only.','https://api.producthunt.com/v2/docs'),
('SRC-041','G2 (AI Agents categories)','https://www.g2.com/','Competitors & directories','Review platform','Both','P2','None (reference only)','partial','Quarterly reports',null,'ToS prohibits scraping; APIs are for vendors'' own data/partners','Paid data partnerships',null,false,false,'Owns enterprise buyer trust; could launch agent rankings','https://company.g2.com/news/g2-fall-2026-reports'),
('SRC-042','Capterra','https://www.capterra.com/','Competitors & directories','Review platform','Competitor','P2','None (reference only)','partial','unverified',null,'Gartner Digital Markets; ToS prohibits scraping; no public API','n/a',null,false,false,'Low agent-specific depth','https://www.capterra.com/'),
('SRC-043','AlternativeTo','https://alternativeto.net/','Competitors & directories','Directory','Source','P2','None (reference only)','partial','unverified',null,'No public API; ToS restricts automated access','n/a',null,false,false,'Useful for ''alternatives'' graph only','https://alternativeto.net/software/best-ai-agents-directory/about'),
('SRC-044','Crunchbase','https://www.crunchbase.com/','Competitors & directories','Company database','Source','P1','Official API','yes','Continuous',null,'Paid API license; ToS prohibits scraping and redistribution without license','Paid (enterprise API)',false,false,false,'Funding signals for vendor profiles | Also: Use only for internal verification; for public funding signals prefer press RSS + SEC Form D (free, redistributable facts).','https://www.crunchbase.com/'),
('SRC-045','YC company directory (yc-oss API)','https://github.com/yc-oss/api','Competitors & directories','Company database','Source','P1','Bulk dump/dataset','yes','Community-updated JSON',null,'Unofficial mirror of YC public directory; use for enrichment, attribute YC','Free',null,true,false,'Cheap high-quality seed list of agent startups | Also: New batches = burst of new agent companies (Demo Day). Filter tags ''AI Agents'',''AIOps''.','https://github.com/SylphAI-Inc/yc-agent-landscape'),
('SRC-046','e2b-dev/awesome-ai-agents','https://github.com/e2b-dev/awesome-ai-agents','Competitors & directories','Directory','Source','P1','Bulk dump/dataset','partial','Irregular community PRs',null,'MIT licence - reuse allowed with attribution','Free',null,true,false,'Other awesome-ai-agents lists exist (e.g. kyrolabs); parse README markdown','https://github.com/e2b-dev/awesome-ai-agents'),
('SRC-047','Agent task marketplaces (dealwork.ai, opentask.ai, execution.market, BountyBook, AgentWork, toku.agency, Circle agent marketplace)','https://dev.to/kirothebot/the-agent-economy-is-real-12-platforms-where-ai-agents-actually-earn-money-may-2026-5bm2','Competitors & directories','Marketplace','Source','P1','HTML scraping','partial','Real-time',null,'Varies; many settle on-chain (USDC on Base/Solana) so payments are publicly observable','Free',null,false,false,'On-chain settlement = scrape-free transaction data; x402 ecosystem is the payment layer to watch','https://news.ycombinator.com/item?id=47155088'),
('SRC-048','MIT AI Agent Index','https://aiagentindex.mit.edu/','Competitors & directories','Competitor index','Source','P2','Bulk dump/dataset','yes','Annual',null,'Academic; check dataset licence','Free',null,false,false,'Credibility anchor for methodology','https://arxiv.org/html/2602.17753v1'),
('SRC-049','Vendor pricing pages (direct crawl)','https://<vendor>/pricing','Pricing, models & signals','Pricing','Source','P0','HTML scraping','partial','daily hash check, full parse weekly','1 day'::interval,'Public page; check each ToS + robots.txt; low risk for factual prices at polite rates (facts not copyrightable in US/EU, but EU sui generis DB right + ToS contract claims possible). No login walls.','free (crawler infra; headless browser for JS pages ~$0.5-3/1k renders via Browserless/ScrapingBee if needed)',null,false,true,'Core moat: normalized, time-stamped price observations. schema.org Offer/Product JSON-LD is rare on SaaS pricing pages (unverified sample; proxy blocked test) -> plan for LLM-assisted extraction from rendered HTML + diffing. Many pages are Next.js/Framer (often SSR, some client-rendered); Cloudflare bot mgmt on a minority. Use sitemap.xml to find /pricing, identify UA, respect robots.','https://schema.org/Offer'),
('SRC-050','Wayback Machine CDX API','https://web.archive.org/cdx/search/cdx','Pricing, models & signals','History / archive','Source','P0','Official API','yes','continuous (new captures daily)','1 day'::interval,'Free public API; IA ToU allows research/personal use, content remains owner''s copyright. Extracting factual prices is low risk; do not republish archived pages. Throttle hard (IA rate-limits/blocks aggressive clients, 429/403).','free (rate-limited, undocumented ~ <1 req/s safe; backoff on 429)',null,false,true,'Backfill recipe: cdx?url=vendor.com/pricing&from=2024&filter=statuscode:200&collapse=digest -> only captures where content changed -> fetch id_ raw HTML -> LLM price extraction. Gives 1-2y history for well-known vendors; long-tail gaps. Pricing rendered client-side via JS/API may be missing in archive. Also use Save Page Now to create our own snapshots going forward (evidence trail). Direct call from this sandbox was blocked (403 proxy), API params verified from IA docs.','https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md'),
('SRC-051','Common Crawl (CDX index + WARC)','https://index.commoncrawl.org/','Pricing, models & signals','History / archive','Source','P1','Bulk dump/dataset','partial','every 1-2 months','30 days'::interval,'Common Crawl ToU: free incl. commercial use of the corpus; underlying page copyright stays with owners; fine for extracting facts.','free (S3 us-east-1 requester egress free in-region; Athena ~$5/TB scanned)',null,false,false,'Complement to Wayback for pricing snapshots of long-tail domains, and discovery of new agent domains (URL patterns like /pricing, ''AI agent''). Lower per-URL frequency than Wayback. Columnar index queryable in Athena/DuckDB.','https://commoncrawl.org/cdxj-index'),
('SRC-052','LiteLLM model_prices_and_context_window.json (+ git history)','https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json','Pricing, models & signals','Model & cost data','Source','P0','Bulk dump/dataset','yes','multiple commits/day','1 day'::interval,'MIT license (litellm repo) - commercial reuse OK with attribution; community-maintained so needs QA.','free',true,true,true,'VERIFIED FREE PRICE-HISTORY BACKFILL: git log of the file gives per-commit snapshots. Test: gpt-4o input $5/M (Sep 2024) -> $2.5/M (Jun 2025) recovered from history. 219 entries Jan 2024 -> 1,048 Jun 2025 -> 4,378 now. Seeds the LLM-cost component of an Agent Economy Price Index from late 2023.','https://github.com/BerriAI/litellm/commits/main/model_prices_and_context_window.json'),
('SRC-053','models.dev (api.json + git history)','https://models.dev/api.json','Pricing, models & signals','Model & cost data','Source','P0','Official API','yes','continuous (PR-driven)',null,'MIT license; maintained by SST/opencode team.','free',true,false,true,'Cleaner per-provider schema than litellm (TOML per model); history back to Jun 2025 only. Cross-check vs litellm & OpenRouter to flag price disagreements.','https://github.com/sst/models.dev'),
('SRC-054','OpenRouter Models API','https://openrouter.ai/api/v1/models','Pricing, models & signals','Model & cost data','Source','P0','Official API','yes','real-time; poll daily/hourly','1 hour'::interval,'OpenRouter ToS; public metadata endpoint widely used; attribute. No bulk resale of their rankings without checking ToS (unverified).','free (no key needed for models list - common usage, not re-verified here)',null,true,true,'Best real-time market price across ~60+ inference providers; ''created'' timestamp = new-model signal. Snapshot daily ourselves to build history (no official history). openrouter.ai/rankings token-usage = demand signal (HTML).','https://openrouter.ai/docs/guides/overview/models'),
('SRC-055','Artificial Analysis Data API','https://artificialanalysis.ai/api/v2/language/models/free','Pricing, models & signals','Model & cost data','Both','P1','Official API','yes','daily/continuous benchmarking','1 day'::interval,'Attribution required on all tiers; free tier for public subset; commercial use/redistribution negotiated per org.','free tier 100 req/24h (fixed window); Pro/Commercial paid (price on request)',false,true,false,'Independent measured speed/latency/price - good for Capability Bot and ''price-performance'' index. Must display attribution; check whether index derivation counts as redistribution before launch. | Also: Could extend from models to agents quickly','https://artificialanalysis.ai/data-api/docs'),
('SRC-056','LMArena leaderboard dataset (+ HF Open LLM Leaderboard archive)','https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset','Pricing, models & signals','Model & cost data','Source','P1','Bulk dump/dataset','yes','each leaderboard publish (roughly weekly)','7 days'::interval,'HF dataset license to be checked per card (unverified); Open LLM Leaderboard is retired (archived 2024-2025) - static only.','free',null,false,false,'Historical capability scores to pair with price history (price-per-quality index). HF Open LLM Leaderboard: archived, use only for open-model historical baseline (P2).','https://arena.ai/blog/arena-leaderboard-dataset'),
('SRC-057','Epoch AI - Data on AI Models','https://epoch.ai/data/ai-models','Pricing, models & signals','Model & cost data','Source','P2','Bulk dump/dataset','yes','continuous (weekly-ish)','7 days'::interval,'Published as open data (CC BY per Epoch - unverified in this session); attribution.','free CSV download',null,true,false,'Company<->model mapping and release dates; useful for ''model lineage'' of agents.','https://epoch.ai/data/ai-models-documentation/downloads'),
('SRC-058','Hacker News Algolia API','https://hn.algolia.com/api/v1/search_by_date','Pricing, models & signals','Market signals','Source','P0','Official API','yes','near real-time',null,'Free public API, no key; HN content copyright of posters - store metadata + link, not full comments.','free (~10k req/h per IP - commonly cited, unverified)',true,false,true,'''Show HN''/''Launch HN'' = new agent launch signal; points velocity = buzz. Official Firebase API as backup.','https://hn.algolia.com/api'),
('SRC-059','Reddit Data API','https://www.reddit.com/dev/api','Pricing, models & signals','Market signals','Source','P2','Official API','yes','real-time',null,'HIGH RISK: commercial use requires contract & manual approval (2-4 wk); ML training explicitly prohibited without permission; brand monitoring/reselling need contracts. Responsible Builder Policy.','free 100 QPM non-commercial; commercial $0.24/1k calls (~$36/mo at 5k calls/day) after approval',false,false,false,'Apply early for commercial access or skip; do not scrape. Use only aggregate counts/links.','https://www.socialcrawl.dev/blog/reddit-data-api-2026'),
('SRC-060','X (Twitter) API v2','https://docs.x.com/x-api','Pricing, models & signals','Market signals','Source','P2','Official API','yes','real-time',null,'Restrictive ToS: no free tier since Feb 2026, redistribution limits, no use for training foundation models; display rules.','pay-per-use $0.005/post read (2M reads/mo cap = $10k); legacy Basic $200/mo, Pro $5k/mo (new signups pay-per-use) - third-party summaries',false,false,false,'Expensive for coverage; budget ~$50-250/mo for targeted queries (10-50k reads) on vendor handles + ''launching'' keywords. Skip at MVP.','https://postproxy.dev/blog/x-api-pricing-2026/'),
('SRC-061','Press & newsletter RSS (TechCrunch AI, VentureBeat, The Verge AI, Crunchbase News, vendor blogs/changelogs)','https://techcrunch.com/category/artificial-intelligence/feed/','Pricing, models & signals','Market signals','Source','P0','RSS/feed','partial','15-60 min',null,'RSS intended for syndication of headlines/links; store title+link+short snippet only; extract facts (funding amount) via LLM.','free',null,false,true,'Primary free funding/launch signal. Vendor changelog/blog RSS doubles as price-change trigger for Pricing Bot. Google News RSS search feeds as supplement (ToS grey).','https://techcrunch.com/category/artificial-intelligence/feed/'),
('SRC-062','arXiv API','https://export.arxiv.org/api/query','Pricing, models & signals','Market signals','Source','P2','Official API','yes','daily','1 day'::interval,'arXiv API ToU: free, max 1 request/3s, attribute arXiv; metadata CC0.','free',null,true,false,'Research-trend signal (e.g., ''computer-use agents''); OAI-PMH for bulk.','https://info.arxiv.org/help/api/tou.html'),
('SRC-063','Google Trends (official alpha API / pytrends unofficial)','https://developers.google.com/search/blog/2025/07/trends-api','Pricing, models & signals','Traffic & demand','Source','P2','Official API','yes','daily','1 day'::interval,'Official API is alpha / limited tester access; pytrends is unofficial scraping (unmaintained, frequent 429s) - ToS grey.','official alpha: free for accepted testers; third-party SERP APIs ~$50-150/mo',null,false,false,'Apply to alpha. Demand index per agent brand/category. Scaling is relative - store raw series.','https://developers.google.com/search/blog/2025/07/trends-api'),
('SRC-064','Tranco list (+ SimilarWeb paid)','https://tranco-list.eu/','Pricing, models & signals','Traffic & demand','Source','P1','Bulk dump/dataset','yes','daily','1 day'::interval,'Tranco: free research list, attribution/citation requested. SimilarWeb: licensed, no redistribution.','Tranco free; SimilarWeb API enterprise-only (typically $10k+/yr; web UI from ~$149/mo) - unverified',null,true,false,'Tranco rank history = free traffic proxy for agent domains in top 1M (long-tail absent). SimilarWeb only if revenue justifies.','https://github.com/DistriNet/tranco-list'),
('SRC-065','Statuspage.io public JSON (and other status pages)','https://status.openai.com/api/v2/summary.json','Pricing, models & signals','Reliability','Source','P1','Official API','yes','poll every 1-5 min',null,'Public unauthenticated endpoints intended for consumption; low risk.','free',null,false,false,'Build our own uptime/incident history -> reliability score. incidents.json backfill limited (~recent 50); Wayback of status pages for deeper history. Non-Statuspage vendors (Instatus, BetterStack) need adapters.','https://developer.statuspage.io/'),
('SRC-066','SEC EDGAR (Form D) + UK Companies House API','https://efts.sec.gov/LATEST/search-index','Pricing, models & signals','Company data','Source','P1','Official API','yes','daily','1 day'::interval,'Public-domain government data (US); Companies House open data (OGL). SEC fair access: max 10 req/s with declared User-Agent.','free (Companies House: 600 req/5 min with free key)',null,false,false,'Free, redistributable funding verification (Form D often filed before press). Estonia/EU registries (e.g., e-Business Register) as later add-ons.','https://www.sec.gov/edgar/searchedgar/accessing-edgar-data.htm'),
('SRC-067','Own-site demand: Google Search Console API + Bing Webmaster API + IndexNow','https://www.bing.com/indexnow','Pricing, models & signals','Traffic & demand','Source','P1','Official API','yes','daily (GSC ~2-3 day lag, 16 months retention)','1 day'::interval,'First-party data - no risk.','free',null,false,false,'Post-launch: search demand per agent/category = proprietary demand index. IndexNow push after each price change for fast Bing/Yandex indexing. Export GSC daily (16-month retention).','https://learn.microsoft.com/en-us/bingwebmaster/'),
('SRC-068','IAB Tech Lab AAMP (Agentic Advertising Management Protocols) incl. OpenProposal, Agentic Direct, Buyer/Seller Agent SDKs','https://iabtechlab.com/standards/aamp-agentic-advertising-management-protocols/','Agentic advertising','Ad protocol / standard','Standard','P0','Spec / GitHub','yes','Major release every ~2-3 months in 2026 (2.0, 2.3, 3.0 on 2026-09-22)','30 days'::interval,'Apache 2.0 code; public comment on specs; Tech Lab membership for working groups','Free (specs/SDKs); Tech Lab membership optional',null,false,true,'AAMP 3.0 also frames a 7-stage lifecycle (Publish, Discover, Compare, Qualify, Negotiate, Bind & Execute, Report). Directly competes with AdCP. Must-support for a seller agent that wants holding-company/agency demand.','https://iabtechlab.com/press-releases/iab-tech-lab-introduces-aamp-3-0-with-openproposal/'),
('SRC-069','AdCP - Ad Context Protocol (AgenticAdvertising.org) incl. Sponsored Intelligence','https://docs.adcontextprotocol.org/','Agentic advertising','Ad protocol / standard','Standard','P0','Spec / GitHub','yes','Frequent point releases (weekly-to-monthly)','7 days'::interval,'Open-source spec (github.com/adcontextprotocol/adcp); free membership','Free',null,false,true,'Launched Oct 2025 by coalition (Scope3/Apostra, Yahoo, PubMatic, Optable, Samba TV, Kargo, etc.). SI is the most direct spec for ''agent-readable ads / sponsored answers'' - a small media with an assistant surface can act as SI host, or as sales agent for its own inventory.','https://docs.adcontextprotocol.org/docs/sponsored-intelligence/specification'),
('SRC-070','IAB Tech Lab ARTF (Agentic RTB Framework) + OpenRTB / AdCOM','https://github.com/IABTechLab/agentic-rtb-framework','Agentic advertising','Ad protocol / standard','Standard','P2','Spec / GitHub','yes','Irregular',null,'Apache 2.0 / IAB spec license','Free',null,false,false,'ARTF = Agentic RTB Framework (agents running inside SSP/DSP infrastructure at bid time). Relevant only if we ever plug into programmatic RTB; not needed for MVP index.','https://github.com/IABTechLab/AAMP'),
('SRC-071','Universal Commerce Protocol (UCP) - Google-led agentic commerce standard','https://ucp.dev/','Agentic advertising','Ad protocol / standard','Standard','P1','Spec / GitHub','yes','Irregular (launched Jan 2026)',null,'Open-source spec','Free',null,false,false,'Commerce (not ad-buying) protocol but it is the rail that sponsored offers in Google AI Mode and Copilot ride on. Naming collision: Pievra lists ''UCP (Agentic Audiences)'' - verify which UCP each source means.','https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/'),
('SRC-072','IAB Tech Lab Agent Registry','https://iabtechlab.com/introducing-the-iab-tech-lab-agent-registry/','Agentic advertising','Ad-tech data source','Source','P0','Official API','yes','Continuous (submission-driven)',null,'Public discovery via Tools Portal; check ToS before bulk mirroring','Free',null,false,true,'Neutral, verified identity layer - ideal seed list for an agent index. Small volume so value is in history/tracking, not size.','https://ppc.land/iab-tech-labs-agent-registry-hits-10-with-amazon-and-new-deployment-types/'),
('SRC-073','AdCP Registry API + /.well-known/adagents.json and brand.json','https://docs.adcontextprotocol.org/docs/registry','Agentic advertising','Ad-tech data source','Source','P0','Official API','yes','Continuous crawl; change feed (auth)',null,'Public resolve/discovery endpoints unauthenticated; rate limits (bulk resolve 20/min)','Free (org API key for feed/search)',null,false,true,'Best machine-readable map of agentic supply today. Also where we would register our own sales agent and publish our own adagents.json/brand.json.','https://adcpexplorer.com/guides/adcp-registry-measured/'),
('SRC-074','ads.txt / app-ads.txt / sellers.json (IAB Tech Lab)','https://iabtechlab.com/sellers-json/','Agentic advertising','Ad-tech data source','Source','P1','Well-known file','yes','Files change daily-weekly','1 day'::interval,'Public files intended for machine reading','Free (crawl cost only)',null,false,false,'Lets the index cross-check which agent-enabled publishers are real sellers and through which SSPs - a differentiator vs. directory sites that only list agents.','https://iabtechlab.com/ads-txt/'),
('SRC-075','Pievra - agentic advertising marketplace & agent-readiness directory','https://pievra.com/','Agentic advertising','Ad-tech data source','Competitor','P0','HTML scraping','partial','unverified (appears weekly)','7 days'::interval,'No public API; scraping subject to ToS - use as reference/benchmark','Free to browse; featured listing EUR 299/mo, verified profile EUR 99/mo',null,false,false,'Closest direct competitor to our index concept; monetizes via sponsorship/featured listings. Shows the model works but the space is tiny and early. | Also: Vertical (programmatic advertising) - template for vertical sub-indices, not a broad threat','https://pievra.com/'),
('SRC-076','AdCP Explorer / No Fluff Advisory AdCP Ecosystem Tracker','https://adcpexplorer.com/','Agentic advertising','Ad-tech data source','Competitor','P1','HTML scraping','partial','Periodic sweeps (e.g. 2026-08-12)',null,'Reference only; cite','Free',null,false,false,'Proves ''agent endpoint liveness/compliance testing'' is a valuable, reproducible signal for an index. Also nofluffadvisory.com/adcp-registry.','https://adcpexplorer.com/guides/adcp-registry-measured/'),
('SRC-077','Signals feed: IABTechLab + adcontextprotocol GitHub releases, trade press (ppc.land, AdExchanger, Digiday, MediaPost)','https://github.com/IABTechLab','Agentic advertising','Ad-tech data source','Source','P0','RSS/feed','partial','Daily','1 day'::interval,'Headlines + links only; no full-text republication','Free (some paywalls)',null,false,true,'Cheapest way to keep the index fresh (e.g. AAMP 3.0 22 Sep, Scope3->Apostra 24 Sep, ChatGPT Ads SEA 23 Sep all surfaced here).','https://ppc.land/iab-tech-lab-gives-industry-until-october-22-to-weigh-in-on-aamp-3-0/'),
('SRC-078','OpenAI - ChatGPT Ads / Ads Manager','https://help.openai.com/en/articles/20001047-ads-in-chatgpt','Agentic advertising','Ad-tech player','Competitor','P1','None (reference only)','no','Monthly announcements','30 days'::interval,'Closed platform','Advertiser: self-serve auction; secondary sources cite ~USD 3-5 CPC after launch-phase USD 60 CPM (unverified)',null,false,false,'Largest ''ads in AI assistant'' surface. Ads are labeled and separated from answers; OpenAI says ads don''t influence responses. Pilot Feb 2026, Ads Manager May 2026.','https://openai.com/index/chatgpt-ads-expands-southeast-asia-taiwan/'),
('SRC-079','Google - Ads in AI Mode / AI Overviews (Conversational Discovery, Highlighted Answers, Direct Offers)','https://blog.google/products/ads-commerce/google-marketing-live-search-ads/','Agentic advertising','Ad-tech player','Competitor','P2','None (reference only)','no','Quarterly (GML May 2026)',null,'Closed platform','Google Ads auction',null,false,false,'GML 2026 (May 20): Conversational Discovery ads + Highlighted Answers testing in US; Direct Offers pilot expanded with UCP native checkout; Business Agent for Leads in open beta.','https://searchengineland.com/google-tests-new-conversational-ad-formats-in-ai-mode-and-search-478115'),
('SRC-080','Microsoft Advertising - Copilot ads (Showroom, Offer Highlights)','https://about.ads.microsoft.com/en/blog/post/april-2026/win-across-all-three-eras-of-the-web','Agentic advertising','Ad-tech player','Competitor','P2','None (reference only)','no','Quarterly',null,'Closed platform','Microsoft Ads auction',null,false,false,'April 2026: Offer Highlights inside Copilot/Edge/Bing product pages (retail, English markets); UCP support in Merchant Center. No AdCP/AAMP mention found.','https://about.ads.microsoft.com/en/blog/post/april-2026/win-across-all-three-eras-of-the-web'),
('SRC-081','Amazon Ads - MCP Server (+ IAB Agent Registry entry)','https://advertising.amazon.com/library/news/amazon-ads-mcp-server-open-beta','Agentic advertising','Ad-tech player','Competitor','P1','Official API','yes','Product updates',null,'Amazon Ads API terms; advertiser account needed','Free access; media spend',null,false,false,'Walled-garden approach: MCP bound to Amazon Ads APIs rather than AdCP/AAMP cross-platform. Registered in IAB Tech Lab Agent Registry.','https://digiday.com/media-buying/ad-tech-briefing-amazon-launches-mcp-server-for-agent-driven-advertising/'),
('SRC-082','Perplexity - sponsored follow-up questions (discontinued)','https://www.perplexity.ai/','Agentic advertising','Ad-tech player','Competitor','P2','None (reference only)','no','n/a',null,'n/a','n/a',null,false,false,'Tested sponsored follow-up questions from Nov 2024, phased them out; 2026 exec quote: ads create doubt about answer integrity, no plans to resume. Useful counter-signal on trust risk of sponsored answers.','https://www.pymnts.com/artificial-intelligence-2/2026/perplexity-pulling-sponsored-answers-from-ai-platform/'),
('SRC-083','Apostra (formerly Scope3) - agentic buying/selling platform, AdCP architect','https://apostra.com/','Agentic advertising','Ad-tech player','Partner candidate','P1','Spec / GitHub','partial','n/a',null,'Commercial platform; AdCP open-source','unverified',null,false,false,'Rebranded from Scope3 on 2026-09-24 (sustainability arm kept as ''Scope3 by Apostra''). CEO Brian O''Kelley. Likeliest first buyer agent to hit a small AdCP seller.','https://www.adweek.com/programmatic/apostra-wants-to-be-the-agentic-ad-layer-does-the-industry-need-one/'),
('SRC-084','SSP seller agents: PubMatic AgenticOS, Magnite (SpringServe seller agent), Kargo, Equativ','https://pubmatic.com/solutions/agents/','Agentic advertising','Ad-tech player','Partner candidate','P1','Well-known file','partial','n/a',null,'Commercial; sellers.json public','Rev-share (SSP take rate)',null,false,false,'PubMatic AgenticOS (CES Jan 2026) and IAB registry entry; Magnite seller agent (Dec 2025, AdCP tests with Scope3, LG, WBD); Kargo AdCP coalition member; Equativ returns products anonymously via AdCP. Route for a small publisher to reach buyer agents without building everything.','https://www.magnite.com/blog/why-magnite-built-a-seller-agent-and-what-it-signals-for-adcp/'),
('SRC-085','The Trade Desk - Kokai / ''Ask Koa'' agents','https://www.thetradedesk.com/','Agentic advertising','Ad-tech player','Competitor','P2','None (reference only)','no','n/a',null,'Closed','n/a',null,false,false,'Leaked H2 2026 deck: Ask Koa conversational interface routing to specialist agents (closed beta). No public AdCP/AAMP commitment found; building agents inside its own DSP.','https://www.adweek.com/media/exclusive-leaked-deck-outlines-the-trade-desks-agentic-plans-for-h2-2026/')
on conflict (code) do update set name=excluded.name, url=excluded.url, priority=excluded.priority, legal=excluded.legal, notes=excluded.notes;

-- ===================== supabase/seed/0101_intendex_taxonomy.sql =====================
-- Generated by scripts/build_seeds.py — Intendex taxonomy v0.1 (draft, editorial)

-- 11 entity types · 9 relation types · 10 categories · 9 protocols · 50 capabilities · 100 tasks



insert into entity_types(code,label,plural,url_prefix,is_listing,sort_order) values
('agent','AI agent','AI agents','/agents',true,10),
('mcp_server','MCP server','MCP servers','/mcp',true,20),
('tool','Tool','Tools','/tools',true,30),
('model','Model','Models','/models',true,40),
('company','Company','Companies','/companies',true,50),
('integration','Integration','Integrations','/integrations',false,60),
('task','Task','Tasks','/tasks',false,70),
('capability','Capability','Capabilities','/capabilities',false,80),
('category','Category','Categories','/agents',false,90),
('protocol','Protocol','Protocols','/protocols',false,95),
('ad_agent','Advertising agent','Advertising agents','/ad-agents',true,100)
on conflict (code) do nothing;

insert into relation_types(code,label,from_type,to_type) values
('has_capability','has capability',null,'capability'),
('solves_task','solves task','agent','task'),
('requires_capability','requires capability','task','capability'),
('in_category','in category',null,'category'),
('integrates_with','integrates with',null,'integration'),
('made_by','made by',null,'company'),
('uses_model','uses model','agent','model'),
('exposes_mcp','exposes MCP server','agent','mcp_server'),
('alternative_to','alternative to','agent','agent')
on conflict (code) do nothing;

insert into entities(type,slug,name,short_description,status,is_published,confidence) values
('category','coding','Coding',null,'active',true,'high'),
('category','research','Research',null,'active',true,'high'),
('category','marketing','Marketing',null,'active',true,'high'),
('category','sales','Sales',null,'active',true,'high'),
('category','customer-support','Customer Support',null,'active',true,'high'),
('category','finance','Finance',null,'active',true,'high'),
('category','data','Data',null,'active',true,'high'),
('category','productivity','Productivity',null,'active',true,'high'),
('category','browser-computer-use','Browser & Computer Use',null,'active',true,'high'),
('category','business-operations','Business Operations',null,'active',true,'high'),
('protocol','api','API','Public HTTP API','active',true,'high'),
('protocol','mcp','MCP','Model Context Protocol server','active',true,'high'),
('protocol','a2a','A2A','Agent2Agent protocol (agent card)','active',true,'high'),
('protocol','webhook','Webhook','Outgoing webhooks','active',true,'high'),
('protocol','sdk','SDK','Official SDK','active',true,'high'),
('protocol','adcp','AdCP','Ad Context Protocol (agentic advertising)','active',true,'high'),
('protocol','aamp','AAMP','IAB Tech Lab Agentic Advertising Management Protocols','active',true,'high'),
('protocol','ucp','UCP','Universal Commerce Protocol','active',true,'high'),
('protocol','ap2','AP2','Agent Payments Protocol','active',true,'high'),
('capability','web-research','Web Research',null,'active',true,'high'),
('capability','web-scraping','Web Scraping',null,'active',true,'high'),
('capability','browser-automation','Browser Automation',null,'active',true,'high'),
('capability','computer-use','Computer Use',null,'active',true,'high'),
('capability','data-extraction','Data Extraction',null,'active',true,'high'),
('capability','document-understanding','Document Understanding',null,'active',true,'high'),
('capability','data-analysis','Data Analysis',null,'active',true,'high'),
('capability','sql-querying','SQL Querying',null,'active',true,'high'),
('capability','spreadsheet-automation','Spreadsheet Automation',null,'active',true,'high'),
('capability','forecasting','Forecasting',null,'active',true,'high'),
('capability','report-generation','Report Generation',null,'active',true,'high'),
('capability','summarization','Summarization',null,'active',true,'high'),
('capability','translation','Translation',null,'active',true,'high'),
('capability','content-writing','Content Writing',null,'active',true,'high'),
('capability','seo-optimization','SEO Optimization',null,'active',true,'high'),
('capability','image-generation','Image Generation',null,'active',true,'high'),
('capability','video-generation','Video Generation',null,'active',true,'high'),
('capability','voice-calls','Voice Calls',null,'active',true,'high'),
('capability','speech-transcription','Speech Transcription',null,'active',true,'high'),
('capability','email-automation','Email Automation',null,'active',true,'high'),
('capability','social-media-management','Social Media Management',null,'active',true,'high'),
('capability','influencer-discovery','Influencer Discovery',null,'active',true,'high'),
('capability','lead-generation','Lead Generation',null,'active',true,'high'),
('capability','lead-enrichment','Lead Enrichment',null,'active',true,'high'),
('capability','lead-scoring','Lead Scoring',null,'active',true,'high'),
('capability','crm-integration','CRM Integration',null,'active',true,'high'),
('capability','outreach-sequencing','Outreach Sequencing',null,'active',true,'high'),
('capability','meeting-scheduling','Meeting Scheduling',null,'active',true,'high'),
('capability','calendar-management','Calendar Management',null,'active',true,'high'),
('capability','customer-chat','Customer Chat',null,'active',true,'high'),
('capability','ticket-triage','Ticket Triage',null,'active',true,'high'),
('capability','knowledge-base-qa','Knowledge Base QA',null,'active',true,'high'),
('capability','code-generation','Code Generation',null,'active',true,'high'),
('capability','code-review','Code Review',null,'active',true,'high'),
('capability','test-generation','Test Generation',null,'active',true,'high'),
('capability','debugging','Debugging',null,'active',true,'high'),
('capability','devops-automation','DevOps Automation',null,'active',true,'high'),
('capability','security-scanning','Security Scanning',null,'active',true,'high'),
('capability','workflow-orchestration','Workflow Orchestration',null,'active',true,'high'),
('capability','api-integration','API Integration',null,'active',true,'high'),
('capability','payments','Payments',null,'active',true,'high'),
('capability','invoicing','Invoicing',null,'active',true,'high'),
('capability','bookkeeping','Bookkeeping',null,'active',true,'high'),
('capability','price-monitoring','Price Monitoring',null,'active',true,'high'),
('capability','e-commerce-management','E-commerce Management',null,'active',true,'high'),
('capability','procurement','Procurement',null,'active',true,'high'),
('capability','travel-booking','Travel Booking',null,'active',true,'high'),
('capability','candidate-sourcing','Candidate Sourcing',null,'active',true,'high'),
('capability','resume-screening','Resume Screening',null,'active',true,'high'),
('capability','competitor-monitoring','Competitor Monitoring',null,'active',true,'high'),
('task','write-code-from-a-specification','Write code from a specification',null,'active',true,'high'),
('task','review-pull-requests','Review pull requests',null,'active',true,'high'),
('task','fix-bugs-in-a-codebase','Fix bugs in a codebase',null,'active',true,'high'),
('task','generate-unit-tests','Generate unit tests',null,'active',true,'high'),
('task','migrate-a-codebase-to-a-new-framework','Migrate a codebase to a new framework',null,'active',true,'high'),
('task','build-an-internal-tool','Build an internal tool',null,'active',true,'high'),
('task','automate-ci-cd-pipelines','Automate CI/CD pipelines',null,'active',true,'high'),
('task','scan-code-for-vulnerabilities','Scan code for vulnerabilities',null,'active',true,'high'),
('task','write-technical-documentation','Write technical documentation',null,'active',true,'high'),
('task','build-a-website','Build a website',null,'active',true,'high'),
('task','integrate-two-apis','Integrate two APIs',null,'active',true,'high'),
('task','monitor-production-incidents','Monitor production incidents',null,'active',true,'high'),
('task','research-competitors','Research competitors',null,'active',true,'high'),
('task','research-a-company','Research a company',null,'active',true,'high'),
('task','do-market-research','Do market research',null,'active',true,'high'),
('task','summarize-academic-papers','Summarize academic papers',null,'active',true,'high'),
('task','monitor-news-on-a-topic','Monitor news on a topic',null,'active',true,'high'),
('task','build-a-literature-review','Build a literature review',null,'active',true,'high'),
('task','fact-check-a-document','Fact-check a document',null,'active',true,'high'),
('task','track-regulatory-changes','Track regulatory changes',null,'active',true,'high'),
('task','analyze-patents','Analyze patents',null,'active',true,'high'),
('task','answer-questions-from-internal-documents','Answer questions from internal documents',null,'active',true,'high'),
('task','write-seo-articles','Write SEO articles',null,'active',true,'high'),
('task','find-influencers','Find influencers',null,'active',true,'high'),
('task','manage-social-media-accounts','Manage social media accounts',null,'active',true,'high'),
('task','create-ad-creatives','Create ad creatives',null,'active',true,'high'),
('task','produce-short-videos','Produce short videos',null,'active',true,'high'),
('task','run-email-marketing-campaigns','Run email marketing campaigns',null,'active',true,'high'),
('task','audit-website-seo','Audit website SEO',null,'active',true,'high'),
('task','optimize-for-ai-search-geo','Optimize for AI search (GEO)',null,'active',true,'high'),
('task','translate-marketing-content','Translate marketing content',null,'active',true,'high'),
('task','monitor-brand-mentions','Monitor brand mentions',null,'active',true,'high'),
('task','plan-a-content-calendar','Plan a content calendar',null,'active',true,'high'),
('task','analyze-campaign-performance','Analyze campaign performance',null,'active',true,'high'),
('task','find-leads','Find leads',null,'active',true,'high'),
('task','qualify-leads','Qualify leads',null,'active',true,'high'),
('task','enrich-crm-contacts','Enrich CRM contacts',null,'active',true,'high'),
('task','send-personalized-outreach','Send personalized outreach',null,'active',true,'high'),
('task','book-sales-meetings','Book sales meetings',null,'active',true,'high'),
('task','make-outbound-sales-calls','Make outbound sales calls',null,'active',true,'high'),
('task','write-sales-proposals','Write sales proposals',null,'active',true,'high'),
('task','update-the-crm-after-calls','Update the CRM after calls',null,'active',true,'high'),
('task','forecast-sales-pipeline','Forecast sales pipeline',null,'active',true,'high'),
('task','research-accounts-before-meetings','Research accounts before meetings',null,'active',true,'high'),
('task','follow-up-on-quotes','Follow up on quotes',null,'active',true,'high'),
('task','find-b2b-partners','Find B2B partners',null,'active',true,'high'),
('task','answer-customer-questions','Answer customer questions',null,'active',true,'high'),
('task','triage-support-tickets','Triage support tickets',null,'active',true,'high'),
('task','automate-customer-support','Automate customer support',null,'active',true,'high'),
('task','answer-support-phone-calls','Answer support phone calls',null,'active',true,'high'),
('task','handle-refund-requests','Handle refund requests',null,'active',true,'high'),
('task','build-a-help-center','Build a help center',null,'active',true,'high'),
('task','support-customers-in-many-languages','Support customers in many languages',null,'active',true,'high'),
('task','analyze-customer-feedback','Analyze customer feedback',null,'active',true,'high'),
('task','track-orders-for-customers','Track orders for customers',null,'active',true,'high'),
('task','run-satisfaction-surveys','Run satisfaction surveys',null,'active',true,'high'),
('task','analyze-financial-documents','Analyze financial documents',null,'active',true,'high'),
('task','automate-bookkeeping','Automate bookkeeping',null,'active',true,'high'),
('task','send-and-chase-invoices','Send and chase invoices',null,'active',true,'high'),
('task','reconcile-payments','Reconcile payments',null,'active',true,'high'),
('task','build-financial-models','Build financial models',null,'active',true,'high'),
('task','process-expense-receipts','Process expense receipts',null,'active',true,'high'),
('task','monitor-company-cash-flow','Monitor company cash flow',null,'active',true,'high'),
('task','research-investment-opportunities','Research investment opportunities',null,'active',true,'high'),
('task','prepare-tax-documents','Prepare tax documents',null,'active',true,'high'),
('task','detect-fraudulent-transactions','Detect fraudulent transactions',null,'active',true,'high'),
('task','extract-website-data','Extract website data',null,'active',true,'high'),
('task','query-databases-in-plain-language','Query databases in plain language',null,'active',true,'high'),
('task','clean-and-merge-spreadsheets','Clean and merge spreadsheets',null,'active',true,'high'),
('task','build-dashboards','Build dashboards',null,'active',true,'high'),
('task','extract-data-from-pdfs','Extract data from PDFs',null,'active',true,'high'),
('task','monitor-prices','Monitor prices',null,'active',true,'high'),
('task','generate-reports','Generate reports',null,'active',true,'high'),
('task','forecast-demand','Forecast demand',null,'active',true,'high'),
('task','label-and-classify-data','Label and classify data',null,'active',true,'high'),
('task','build-data-pipelines','Build data pipelines',null,'active',true,'high'),
('task','manage-my-inbox','Manage my inbox',null,'active',true,'high'),
('task','schedule-meetings','Schedule meetings',null,'active',true,'high'),
('task','take-meeting-notes','Take meeting notes',null,'active',true,'high'),
('task','book-travel','Book travel',null,'active',true,'high'),
('task','summarize-long-documents','Summarize long documents',null,'active',true,'high'),
('task','draft-emails','Draft emails',null,'active',true,'high'),
('task','create-presentations','Create presentations',null,'active',true,'high'),
('task','transcribe-audio-and-video','Transcribe audio and video',null,'active',true,'high'),
('task','fill-web-forms-automatically','Fill web forms automatically',null,'active',true,'high'),
('task','automate-repetitive-desktop-tasks','Automate repetitive desktop tasks',null,'active',true,'high'),
('task','test-web-applications','Test web applications',null,'active',true,'high'),
('task','book-appointments-online','Book appointments online',null,'active',true,'high'),
('task','compare-products-online','Compare products online',null,'active',true,'high'),
('task','buy-products-online','Buy products online',null,'active',true,'high'),
('task','collect-data-behind-logins','Collect data behind logins',null,'active',true,'high'),
('task','operate-legacy-software','Operate legacy software',null,'active',true,'high'),
('task','recruit-developers','Recruit developers',null,'active',true,'high'),
('task','screen-job-applicants','Screen job applicants',null,'active',true,'high'),
('task','automate-business-workflows','Automate business workflows',null,'active',true,'high'),
('task','manage-procurement','Manage procurement',null,'active',true,'high'),
('task','review-contracts','Review contracts',null,'active',true,'high'),
('task','manage-an-online-store','Manage an online store',null,'active',true,'high'),
('task','analyze-real-estate','Analyze real estate',null,'active',true,'high'),
('task','onboard-new-employees','Onboard new employees',null,'active',true,'high')
on conflict (type,slug) do nothing;

insert into relations(from_id,relation,to_id,evidence_level,confidence,source_id)
select f.id, x.rel, t.id, 'declared', 'high', source_id_of('SRC-000')
from (values
  ('write-code-from-a-specification','in_category','category','coding'),
  ('write-code-from-a-specification','requires_capability','capability','code-generation'),
  ('write-code-from-a-specification','requires_capability','capability','test-generation'),
  ('review-pull-requests','in_category','category','coding'),
  ('review-pull-requests','requires_capability','capability','code-review'),
  ('review-pull-requests','requires_capability','capability','security-scanning'),
  ('fix-bugs-in-a-codebase','in_category','category','coding'),
  ('fix-bugs-in-a-codebase','requires_capability','capability','debugging'),
  ('fix-bugs-in-a-codebase','requires_capability','capability','code-generation'),
  ('generate-unit-tests','in_category','category','coding'),
  ('generate-unit-tests','requires_capability','capability','test-generation'),
  ('generate-unit-tests','requires_capability','capability','code-generation'),
  ('migrate-a-codebase-to-a-new-framework','in_category','category','coding'),
  ('migrate-a-codebase-to-a-new-framework','requires_capability','capability','code-generation'),
  ('migrate-a-codebase-to-a-new-framework','requires_capability','capability','test-generation'),
  ('migrate-a-codebase-to-a-new-framework','requires_capability','capability','code-review'),
  ('build-an-internal-tool','in_category','category','coding'),
  ('build-an-internal-tool','requires_capability','capability','code-generation'),
  ('build-an-internal-tool','requires_capability','capability','api-integration'),
  ('automate-ci-cd-pipelines','in_category','category','coding'),
  ('automate-ci-cd-pipelines','requires_capability','capability','devops-automation'),
  ('automate-ci-cd-pipelines','requires_capability','capability','workflow-orchestration'),
  ('scan-code-for-vulnerabilities','in_category','category','coding'),
  ('scan-code-for-vulnerabilities','requires_capability','capability','security-scanning'),
  ('scan-code-for-vulnerabilities','requires_capability','capability','code-review'),
  ('write-technical-documentation','in_category','category','coding'),
  ('write-technical-documentation','requires_capability','capability','content-writing'),
  ('write-technical-documentation','requires_capability','capability','summarization'),
  ('write-technical-documentation','requires_capability','capability','code-review'),
  ('build-a-website','in_category','category','coding'),
  ('build-a-website','requires_capability','capability','code-generation'),
  ('build-a-website','requires_capability','capability','image-generation'),
  ('integrate-two-apis','in_category','category','coding'),
  ('integrate-two-apis','requires_capability','capability','api-integration'),
  ('integrate-two-apis','requires_capability','capability','code-generation'),
  ('monitor-production-incidents','in_category','category','coding'),
  ('monitor-production-incidents','requires_capability','capability','devops-automation'),
  ('monitor-production-incidents','requires_capability','capability','debugging'),
  ('monitor-production-incidents','requires_capability','capability','summarization'),
  ('research-competitors','in_category','category','research'),
  ('research-competitors','requires_capability','capability','web-research'),
  ('research-competitors','requires_capability','capability','competitor-monitoring'),
  ('research-competitors','requires_capability','capability','report-generation'),
  ('research-a-company','in_category','category','research'),
  ('research-a-company','requires_capability','capability','web-research'),
  ('research-a-company','requires_capability','capability','lead-enrichment'),
  ('research-a-company','requires_capability','capability','summarization'),
  ('do-market-research','in_category','category','research'),
  ('do-market-research','requires_capability','capability','web-research'),
  ('do-market-research','requires_capability','capability','data-analysis'),
  ('do-market-research','requires_capability','capability','report-generation'),
  ('summarize-academic-papers','in_category','category','research'),
  ('summarize-academic-papers','requires_capability','capability','document-understanding'),
  ('summarize-academic-papers','requires_capability','capability','summarization'),
  ('monitor-news-on-a-topic','in_category','category','research'),
  ('monitor-news-on-a-topic','requires_capability','capability','web-research'),
  ('monitor-news-on-a-topic','requires_capability','capability','summarization'),
  ('build-a-literature-review','in_category','category','research'),
  ('build-a-literature-review','requires_capability','capability','web-research'),
  ('build-a-literature-review','requires_capability','capability','document-understanding'),
  ('build-a-literature-review','requires_capability','capability','report-generation'),
  ('fact-check-a-document','in_category','category','research'),
  ('fact-check-a-document','requires_capability','capability','web-research'),
  ('fact-check-a-document','requires_capability','capability','document-understanding'),
  ('track-regulatory-changes','in_category','category','research'),
  ('track-regulatory-changes','requires_capability','capability','web-research'),
  ('track-regulatory-changes','requires_capability','capability','summarization'),
  ('track-regulatory-changes','requires_capability','capability','competitor-monitoring'),
  ('analyze-patents','in_category','category','research'),
  ('analyze-patents','requires_capability','capability','document-understanding'),
  ('analyze-patents','requires_capability','capability','data-analysis'),
  ('answer-questions-from-internal-documents','in_category','category','research'),
  ('answer-questions-from-internal-documents','requires_capability','capability','knowledge-base-qa'),
  ('answer-questions-from-internal-documents','requires_capability','capability','document-understanding'),
  ('write-seo-articles','in_category','category','marketing'),
  ('write-seo-articles','requires_capability','capability','content-writing'),
  ('write-seo-articles','requires_capability','capability','seo-optimization'),
  ('write-seo-articles','requires_capability','capability','web-research'),
  ('find-influencers','in_category','category','marketing'),
  ('find-influencers','requires_capability','capability','influencer-discovery'),
  ('find-influencers','requires_capability','capability','web-research'),
  ('manage-social-media-accounts','in_category','category','marketing'),
  ('manage-social-media-accounts','requires_capability','capability','social-media-management'),
  ('manage-social-media-accounts','requires_capability','capability','content-writing'),
  ('manage-social-media-accounts','requires_capability','capability','image-generation'),
  ('create-ad-creatives','in_category','category','marketing'),
  ('create-ad-creatives','requires_capability','capability','image-generation'),
  ('create-ad-creatives','requires_capability','capability','content-writing'),
  ('create-ad-creatives','requires_capability','capability','video-generation'),
  ('produce-short-videos','in_category','category','marketing'),
  ('produce-short-videos','requires_capability','capability','video-generation'),
  ('produce-short-videos','requires_capability','capability','content-writing'),
  ('run-email-marketing-campaigns','in_category','category','marketing'),
  ('run-email-marketing-campaigns','requires_capability','capability','email-automation'),
  ('run-email-marketing-campaigns','requires_capability','capability','content-writing'),
  ('audit-website-seo','in_category','category','marketing'),
  ('audit-website-seo','requires_capability','capability','seo-optimization'),
  ('audit-website-seo','requires_capability','capability','web-scraping'),
  ('audit-website-seo','requires_capability','capability','report-generation'),
  ('optimize-for-ai-search-geo','in_category','category','marketing'),
  ('optimize-for-ai-search-geo','requires_capability','capability','seo-optimization'),
  ('optimize-for-ai-search-geo','requires_capability','capability','content-writing'),
  ('optimize-for-ai-search-geo','requires_capability','capability','web-research'),
  ('translate-marketing-content','in_category','category','marketing'),
  ('translate-marketing-content','requires_capability','capability','translation'),
  ('translate-marketing-content','requires_capability','capability','content-writing'),
  ('monitor-brand-mentions','in_category','category','marketing'),
  ('monitor-brand-mentions','requires_capability','capability','web-research'),
  ('monitor-brand-mentions','requires_capability','capability','social-media-management'),
  ('monitor-brand-mentions','requires_capability','capability','summarization'),
  ('plan-a-content-calendar','in_category','category','marketing'),
  ('plan-a-content-calendar','requires_capability','capability','content-writing'),
  ('plan-a-content-calendar','requires_capability','capability','calendar-management'),
  ('analyze-campaign-performance','in_category','category','marketing'),
  ('analyze-campaign-performance','requires_capability','capability','data-analysis'),
  ('analyze-campaign-performance','requires_capability','capability','report-generation'),
  ('find-leads','in_category','category','sales'),
  ('find-leads','requires_capability','capability','lead-generation'),
  ('find-leads','requires_capability','capability','web-research'),
  ('qualify-leads','in_category','category','sales'),
  ('qualify-leads','requires_capability','capability','lead-scoring'),
  ('qualify-leads','requires_capability','capability','lead-enrichment'),
  ('qualify-leads','requires_capability','capability','crm-integration'),
  ('enrich-crm-contacts','in_category','category','sales'),
  ('enrich-crm-contacts','requires_capability','capability','lead-enrichment'),
  ('enrich-crm-contacts','requires_capability','capability','crm-integration'),
  ('send-personalized-outreach','in_category','category','sales'),
  ('send-personalized-outreach','requires_capability','capability','outreach-sequencing'),
  ('send-personalized-outreach','requires_capability','capability','email-automation'),
  ('send-personalized-outreach','requires_capability','capability','lead-enrichment'),
  ('book-sales-meetings','in_category','category','sales'),
  ('book-sales-meetings','requires_capability','capability','meeting-scheduling'),
  ('book-sales-meetings','requires_capability','capability','email-automation'),
  ('make-outbound-sales-calls','in_category','category','sales'),
  ('make-outbound-sales-calls','requires_capability','capability','voice-calls'),
  ('make-outbound-sales-calls','requires_capability','capability','lead-scoring'),
  ('make-outbound-sales-calls','requires_capability','capability','crm-integration'),
  ('write-sales-proposals','in_category','category','sales'),
  ('write-sales-proposals','requires_capability','capability','content-writing'),
  ('write-sales-proposals','requires_capability','capability','document-understanding'),
  ('update-the-crm-after-calls','in_category','category','sales'),
  ('update-the-crm-after-calls','requires_capability','capability','speech-transcription'),
  ('update-the-crm-after-calls','requires_capability','capability','crm-integration'),
  ('update-the-crm-after-calls','requires_capability','capability','summarization'),
  ('forecast-sales-pipeline','in_category','category','sales'),
  ('forecast-sales-pipeline','requires_capability','capability','forecasting'),
  ('forecast-sales-pipeline','requires_capability','capability','crm-integration'),
  ('forecast-sales-pipeline','requires_capability','capability','data-analysis'),
  ('research-accounts-before-meetings','in_category','category','sales'),
  ('research-accounts-before-meetings','requires_capability','capability','web-research'),
  ('research-accounts-before-meetings','requires_capability','capability','lead-enrichment'),
  ('research-accounts-before-meetings','requires_capability','capability','summarization'),
  ('follow-up-on-quotes','in_category','category','sales'),
  ('follow-up-on-quotes','requires_capability','capability','email-automation'),
  ('follow-up-on-quotes','requires_capability','capability','crm-integration'),
  ('find-b2b-partners','in_category','category','sales'),
  ('find-b2b-partners','requires_capability','capability','lead-generation'),
  ('find-b2b-partners','requires_capability','capability','web-research'),
  ('find-b2b-partners','requires_capability','capability','lead-scoring'),
  ('answer-customer-questions','in_category','category','customer-support'),
  ('answer-customer-questions','requires_capability','capability','customer-chat'),
  ('answer-customer-questions','requires_capability','capability','knowledge-base-qa'),
  ('triage-support-tickets','in_category','category','customer-support'),
  ('triage-support-tickets','requires_capability','capability','ticket-triage'),
  ('triage-support-tickets','requires_capability','capability','summarization'),
  ('automate-customer-support','in_category','category','customer-support'),
  ('automate-customer-support','requires_capability','capability','customer-chat'),
  ('automate-customer-support','requires_capability','capability','ticket-triage'),
  ('automate-customer-support','requires_capability','capability','knowledge-base-qa'),
  ('answer-support-phone-calls','in_category','category','customer-support'),
  ('answer-support-phone-calls','requires_capability','capability','voice-calls'),
  ('answer-support-phone-calls','requires_capability','capability','knowledge-base-qa'),
  ('handle-refund-requests','in_category','category','customer-support'),
  ('handle-refund-requests','requires_capability','capability','customer-chat'),
  ('handle-refund-requests','requires_capability','capability','payments'),
  ('handle-refund-requests','requires_capability','capability','workflow-orchestration'),
  ('build-a-help-center','in_category','category','customer-support'),
  ('build-a-help-center','requires_capability','capability','content-writing'),
  ('build-a-help-center','requires_capability','capability','knowledge-base-qa'),
  ('support-customers-in-many-languages','in_category','category','customer-support'),
  ('support-customers-in-many-languages','requires_capability','capability','translation'),
  ('support-customers-in-many-languages','requires_capability','capability','customer-chat'),
  ('analyze-customer-feedback','in_category','category','customer-support'),
  ('analyze-customer-feedback','requires_capability','capability','data-analysis'),
  ('analyze-customer-feedback','requires_capability','capability','summarization'),
  ('track-orders-for-customers','in_category','category','customer-support'),
  ('track-orders-for-customers','requires_capability','capability','customer-chat'),
  ('track-orders-for-customers','requires_capability','capability','e-commerce-management'),
  ('track-orders-for-customers','requires_capability','capability','api-integration'),
  ('run-satisfaction-surveys','in_category','category','customer-support'),
  ('run-satisfaction-surveys','requires_capability','capability','email-automation'),
  ('run-satisfaction-surveys','requires_capability','capability','data-analysis'),
  ('analyze-financial-documents','in_category','category','finance'),
  ('analyze-financial-documents','requires_capability','capability','document-understanding'),
  ('analyze-financial-documents','requires_capability','capability','data-analysis'),
  ('automate-bookkeeping','in_category','category','finance'),
  ('automate-bookkeeping','requires_capability','capability','bookkeeping'),
  ('automate-bookkeeping','requires_capability','capability','data-extraction'),
  ('send-and-chase-invoices','in_category','category','finance'),
  ('send-and-chase-invoices','requires_capability','capability','invoicing'),
  ('send-and-chase-invoices','requires_capability','capability','email-automation'),
  ('reconcile-payments','in_category','category','finance'),
  ('reconcile-payments','requires_capability','capability','payments'),
  ('reconcile-payments','requires_capability','capability','bookkeeping'),
  ('reconcile-payments','requires_capability','capability','spreadsheet-automation'),
  ('build-financial-models','in_category','category','finance'),
  ('build-financial-models','requires_capability','capability','spreadsheet-automation'),
  ('build-financial-models','requires_capability','capability','forecasting'),
  ('process-expense-receipts','in_category','category','finance'),
  ('process-expense-receipts','requires_capability','capability','data-extraction'),
  ('process-expense-receipts','requires_capability','capability','bookkeeping'),
  ('monitor-company-cash-flow','in_category','category','finance'),
  ('monitor-company-cash-flow','requires_capability','capability','forecasting'),
  ('monitor-company-cash-flow','requires_capability','capability','report-generation'),
  ('research-investment-opportunities','in_category','category','finance'),
  ('research-investment-opportunities','requires_capability','capability','web-research'),
  ('research-investment-opportunities','requires_capability','capability','data-analysis'),
  ('research-investment-opportunities','requires_capability','capability','report-generation'),
  ('prepare-tax-documents','in_category','category','finance'),
  ('prepare-tax-documents','requires_capability','capability','document-understanding'),
  ('prepare-tax-documents','requires_capability','capability','bookkeeping'),
  ('detect-fraudulent-transactions','in_category','category','finance'),
  ('detect-fraudulent-transactions','requires_capability','capability','data-analysis'),
  ('detect-fraudulent-transactions','requires_capability','capability','payments'),
  ('extract-website-data','in_category','category','data'),
  ('extract-website-data','requires_capability','capability','web-scraping'),
  ('extract-website-data','requires_capability','capability','data-extraction'),
  ('query-databases-in-plain-language','in_category','category','data'),
  ('query-databases-in-plain-language','requires_capability','capability','sql-querying'),
  ('query-databases-in-plain-language','requires_capability','capability','data-analysis'),
  ('clean-and-merge-spreadsheets','in_category','category','data'),
  ('clean-and-merge-spreadsheets','requires_capability','capability','spreadsheet-automation'),
  ('clean-and-merge-spreadsheets','requires_capability','capability','data-extraction'),
  ('build-dashboards','in_category','category','data'),
  ('build-dashboards','requires_capability','capability','data-analysis'),
  ('build-dashboards','requires_capability','capability','report-generation'),
  ('extract-data-from-pdfs','in_category','category','data'),
  ('extract-data-from-pdfs','requires_capability','capability','document-understanding'),
  ('extract-data-from-pdfs','requires_capability','capability','data-extraction'),
  ('monitor-prices','in_category','category','data'),
  ('monitor-prices','requires_capability','capability','price-monitoring'),
  ('monitor-prices','requires_capability','capability','web-scraping'),
  ('generate-reports','in_category','category','data'),
  ('generate-reports','requires_capability','capability','report-generation'),
  ('generate-reports','requires_capability','capability','data-analysis'),
  ('forecast-demand','in_category','category','data'),
  ('forecast-demand','requires_capability','capability','forecasting'),
  ('forecast-demand','requires_capability','capability','data-analysis'),
  ('label-and-classify-data','in_category','category','data'),
  ('label-and-classify-data','requires_capability','capability','data-extraction'),
  ('label-and-classify-data','requires_capability','capability','summarization'),
  ('build-data-pipelines','in_category','category','data'),
  ('build-data-pipelines','requires_capability','capability','workflow-orchestration'),
  ('build-data-pipelines','requires_capability','capability','api-integration'),
  ('build-data-pipelines','requires_capability','capability','sql-querying'),
  ('manage-my-inbox','in_category','category','productivity'),
  ('manage-my-inbox','requires_capability','capability','email-automation'),
  ('manage-my-inbox','requires_capability','capability','summarization'),
  ('schedule-meetings','in_category','category','productivity'),
  ('schedule-meetings','requires_capability','capability','meeting-scheduling'),
  ('schedule-meetings','requires_capability','capability','calendar-management'),
  ('take-meeting-notes','in_category','category','productivity'),
  ('take-meeting-notes','requires_capability','capability','speech-transcription'),
  ('take-meeting-notes','requires_capability','capability','summarization'),
  ('book-travel','in_category','category','productivity'),
  ('book-travel','requires_capability','capability','travel-booking'),
  ('book-travel','requires_capability','capability','calendar-management'),
  ('summarize-long-documents','in_category','category','productivity'),
  ('summarize-long-documents','requires_capability','capability','summarization'),
  ('summarize-long-documents','requires_capability','capability','document-understanding'),
  ('draft-emails','in_category','category','productivity'),
  ('draft-emails','requires_capability','capability','email-automation'),
  ('draft-emails','requires_capability','capability','content-writing'),
  ('create-presentations','in_category','category','productivity'),
  ('create-presentations','requires_capability','capability','content-writing'),
  ('create-presentations','requires_capability','capability','image-generation'),
  ('create-presentations','requires_capability','capability','report-generation'),
  ('transcribe-audio-and-video','in_category','category','productivity'),
  ('transcribe-audio-and-video','requires_capability','capability','speech-transcription'),
  ('transcribe-audio-and-video','requires_capability','capability','translation'),
  ('fill-web-forms-automatically','in_category','category','browser-computer-use'),
  ('fill-web-forms-automatically','requires_capability','capability','browser-automation'),
  ('fill-web-forms-automatically','requires_capability','capability','data-extraction'),
  ('automate-repetitive-desktop-tasks','in_category','category','browser-computer-use'),
  ('automate-repetitive-desktop-tasks','requires_capability','capability','computer-use'),
  ('automate-repetitive-desktop-tasks','requires_capability','capability','workflow-orchestration'),
  ('test-web-applications','in_category','category','browser-computer-use'),
  ('test-web-applications','requires_capability','capability','browser-automation'),
  ('test-web-applications','requires_capability','capability','test-generation'),
  ('book-appointments-online','in_category','category','browser-computer-use'),
  ('book-appointments-online','requires_capability','capability','browser-automation'),
  ('book-appointments-online','requires_capability','capability','calendar-management'),
  ('compare-products-online','in_category','category','browser-computer-use'),
  ('compare-products-online','requires_capability','capability','browser-automation'),
  ('compare-products-online','requires_capability','capability','price-monitoring'),
  ('compare-products-online','requires_capability','capability','web-research'),
  ('buy-products-online','in_category','category','browser-computer-use'),
  ('buy-products-online','requires_capability','capability','browser-automation'),
  ('buy-products-online','requires_capability','capability','payments'),
  ('buy-products-online','requires_capability','capability','e-commerce-management'),
  ('collect-data-behind-logins','in_category','category','browser-computer-use'),
  ('collect-data-behind-logins','requires_capability','capability','browser-automation'),
  ('collect-data-behind-logins','requires_capability','capability','web-scraping'),
  ('operate-legacy-software','in_category','category','browser-computer-use'),
  ('operate-legacy-software','requires_capability','capability','computer-use'),
  ('operate-legacy-software','requires_capability','capability','data-extraction'),
  ('recruit-developers','in_category','category','business-operations'),
  ('recruit-developers','requires_capability','capability','candidate-sourcing'),
  ('recruit-developers','requires_capability','capability','resume-screening'),
  ('recruit-developers','requires_capability','capability','outreach-sequencing'),
  ('screen-job-applicants','in_category','category','business-operations'),
  ('screen-job-applicants','requires_capability','capability','resume-screening'),
  ('screen-job-applicants','requires_capability','capability','meeting-scheduling'),
  ('automate-business-workflows','in_category','category','business-operations'),
  ('automate-business-workflows','requires_capability','capability','workflow-orchestration'),
  ('automate-business-workflows','requires_capability','capability','api-integration'),
  ('manage-procurement','in_category','category','business-operations'),
  ('manage-procurement','requires_capability','capability','procurement'),
  ('manage-procurement','requires_capability','capability','price-monitoring'),
  ('manage-procurement','requires_capability','capability','document-understanding'),
  ('review-contracts','in_category','category','business-operations'),
  ('review-contracts','requires_capability','capability','document-understanding'),
  ('review-contracts','requires_capability','capability','summarization'),
  ('manage-an-online-store','in_category','category','business-operations'),
  ('manage-an-online-store','requires_capability','capability','e-commerce-management'),
  ('manage-an-online-store','requires_capability','capability','content-writing'),
  ('manage-an-online-store','requires_capability','capability','price-monitoring'),
  ('analyze-real-estate','in_category','category','business-operations'),
  ('analyze-real-estate','requires_capability','capability','data-analysis'),
  ('analyze-real-estate','requires_capability','capability','web-research'),
  ('analyze-real-estate','requires_capability','capability','report-generation'),
  ('onboard-new-employees','in_category','category','business-operations'),
  ('onboard-new-employees','requires_capability','capability','knowledge-base-qa'),
  ('onboard-new-employees','requires_capability','capability','workflow-orchestration')
) as x(task_slug, rel, to_type, to_slug)
join entities f on f.type = 'task' and f.slug = x.task_slug
join entities t on t.type = x.to_type and t.slug = x.to_slug
on conflict do nothing;

-- ===================== supabase/seed/0102_methodology_config.sql =====================
-- Intendex — engine config + Agent Score methodology v1.0
insert into engine_config(key, value) values
  ('vertical',        '"intendex"'),
  ('engine_version',  '"0.1"'),
  ('public_language', '"en"'),
  ('publish_rules',   '{"min_confidence":"medium","min_sources":1,"require_verified_within_days":90}')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Agent Score v1.0 — weights sum to 100.
-- Reliability is 0 until our own probes produce uptime data (never scored from vendor claims).
-- Its 20 points from the original brief are redistributed: capability +5, integration +5,
-- documentation +5, pricing +5.
insert into methodologies(code, version, label, weights, description, published_at, is_current) values
('agent_score', '1.0', 'Agent Score v1.0',
 '{"capability":25,"integration":20,"documentation":15,"pricing":15,"transparency":10,"freshness":10,"human_oversight":5,"reliability":0}',
 'Measures the coverage and quality of OBSERVABLE public data about an agent, per this published methodology. It is not a guarantee of performance. Missing data scores 0 on its component and lowers the confidence level.',
 now(), true),
('agent_price_index', '0.1', 'Agent Economy Price Index (draft)',
 '{"base":100,"method":"like-for-like median price change of plans observed on both dates","min_constituents":50}',
 'Based on observed public pricing data only. Not published until at least 50 like-for-like plans exist.',
 null, true)
on conflict (code, version) do nothing;

-- Vérification (doit afficher capability 50, category 10, protocol 9, task 100)
select type, count(*) from entities group by type order by type;
