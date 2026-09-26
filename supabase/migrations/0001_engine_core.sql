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
