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
