-- =====================================================================
-- 0014 — Commercial agents + price, quality and value in rankings
--  * ingest_agent(jsonb): one researched agent -> entity, company, theme,
--    declared capabilities, facts, price plans (history), Agent Score.
--    Initial-load events (new entity, plan added) are not published as news.
--  * Rankings gain: quality score, price from ($/month), free plan, value label.
--    Value rules v1 (published on the Methodology page):
--      best    = quality >= 60 and entry price <= $50/month (or free with no paid plan listed)
--      premium = quality >= 70 and entry price  > $50/month
--      free    = has a free plan (quality below the "best" bar)
--      fair    = everything else with a published monthly price
--      (no label when the price is on quote or not published)
-- =====================================================================

create or replace function ingest_agent(p jsonb) returns uuid language plpgsql as $$
declare
  v_id uuid; v_co uuid; v_theme uuid; v_cap uuid; pl jsonb; c text;
  v_started timestamptz := clock_timestamp();
  v_aliases jsonb := coalesce(p->'aliases', jsonb_build_array(jsonb_build_object('type','domain','value', p->>'website')));
  v_plan text; v_billing text; v_amount numeric; v_currency text; v_interval text;
  v_seen text[] := '{}';
  v_ev evidence_level := case when (p->>'pricing_verified')::boolean then 'observed' else 'declared' end;
begin
  if p->>'name' is null or p->>'website' is null then return null; end if;
  if coalesce(p->>'github_repo','') <> '' and p->'aliases' is null then
    v_aliases := v_aliases || jsonb_build_array(jsonb_build_object('type','github_repo','value', p->>'github_repo'));
  end if;

  v_id := resolve_entity('agent', p->>'name', v_aliases, 'SRC-049', p->>'website', left(p->>'short_description', 300));
  update entities set status = 'active', is_published = true, confidence = 'medium',
         website = coalesce(website, p->>'website'),
         short_description = coalesce(short_description, left(p->>'short_description', 300))
   where id = v_id;

  -- company
  if coalesce(p->>'company','') <> '' then
    v_co := resolve_entity('company', p->>'company', jsonb_build_array(jsonb_build_object('type','name','value', p->>'company')), 'SRC-049', p->>'website', null);
    update entities set status = 'active', is_published = true where id = v_co;
    perform link(v_id, 'made_by', v_co, 'declared', 'SRC-049', 'high');
  end if;

  -- theme
  for c in select jsonb_array_elements_text(coalesce(p->'themes', jsonb_build_array(p->>'theme'))) loop
    select id into v_theme from entities where type = 'category' and name = c;
    if v_theme is not null then perform link(v_id, 'in_category', v_theme, 'declared', 'SRC-000', 'high'); end if;
  end loop;

  -- capabilities stated on the vendor site
  for c in select jsonb_array_elements_text(coalesce(p->'capabilities', '[]'::jsonb)) loop
    select id into v_cap from entities where type = 'capability' and name = c;
    if v_cap is not null then
      perform link(v_id, 'has_capability', v_cap, 'declared', 'SRC-049', 'medium', 'vendor website', p->>'website');
    end if;
  end loop;

  -- facts (only documented ones; null = unknown = no row)
  if p->'api' is not null and jsonb_typeof(p->'api') = 'boolean' then perform record_observation(v_id, 'protocol.api', p->'api', 'declared', 'SRC-049', 'medium', p->>'website'); end if;
  if p->'mcp' is not null and jsonb_typeof(p->'mcp') = 'boolean' then perform record_observation(v_id, 'protocol.mcp', p->'mcp', 'declared', 'SRC-049', 'medium', p->>'website'); end if;
  if p->'open_source' is not null and jsonb_typeof(p->'open_source') = 'boolean' then perform record_observation(v_id, 'open_source', p->'open_source', 'declared', 'SRC-049', 'medium', p->>'website'); end if;
  if p->'free_plan' is not null and jsonb_typeof(p->'free_plan') = 'boolean' then perform record_observation(v_id, 'pricing.free_plan', p->'free_plan', v_ev, 'SRC-049', 'medium', p->>'pricing_url'); end if;
  if p->'free_trial' is not null and jsonb_typeof(p->'free_trial') = 'boolean' then perform record_observation(v_id, 'pricing.free_trial', p->'free_trial', v_ev, 'SRC-049', 'medium', p->>'pricing_url'); end if;
  perform record_observation(v_id, 'website.url', to_jsonb(p->>'website'), 'declared', 'SRC-049', 'high', p->>'website');
  if coalesce(p->>'pricing_url','') <> '' then perform record_observation(v_id, 'pricing.url', to_jsonb(p->>'pricing_url'), 'declared', 'SRC-049', 'high', p->>'pricing_url'); end if;

  -- price plans
  for pl in select * from jsonb_array_elements(coalesce(p->'plans', '[]'::jsonb)) loop
    v_billing := pl->>'billing_model';
    if v_billing not in ('free','subscription','usage','credits','seat','one_time','enterprise_quote','open_source') then continue; end if;
    v_amount := nullif(pl->>'amount','')::numeric;
    v_currency := nullif(upper(pl->>'currency'), '');
    v_interval := nullif(pl->>'interval', '');
    if v_interval not in ('month','year','one_time','per_unit') then v_interval := null; end if;
    if v_billing in ('free','open_source') and v_amount is null then v_amount := 0; v_currency := coalesce(v_currency, 'USD'); end if;
    if v_billing = 'enterprise_quote' then v_amount := null; v_currency := null; v_interval := null; end if;
    if v_amount is null and v_billing <> 'enterprise_quote' then continue; end if;   -- price not published: unknown, skip
    if v_amount is not null and v_currency is null then v_currency := 'USD'; end if;
    if v_amount > 0 and round(v_amount, 4) = 0 then continue; end if;             -- sub-cent unit prices: below storage precision
    v_amount := round(v_amount, 4);
    v_plan := coalesce(nullif(pl->>'plan',''), 'Plan') || case when v_interval = 'year' then ' (annual)' else '' end;
    if lower(v_plan) = any(v_seen) then continue; end if;
    v_seen := v_seen || lower(v_plan);
    perform record_price(v_id, v_plan, v_billing, v_amount, v_currency, v_interval, 'SRC-049',
                         nullif(pl->>'unit',''), coalesce((pl->>'is_trial')::boolean, false), p->>'pricing_url', null, v_ev);
  end loop;

  -- initial load is not news
  delete from change_events
   where entity_id in (v_id, v_co) and detected_at >= v_started
     and event_type in ('new_entity','plan_added','capability_added');

  perform compute_agent_score(v_id);
  return v_id;
end $$;
revoke execute on function ingest_agent(jsonb) from public, anon, authenticated;

create or replace function ingest_agents(p jsonb) returns jsonb language plpgsql as $$
declare it jsonb; n int := 0; n_err int := 0; errs jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(p) loop
    begin
      perform ingest_agent(it); n := n + 1;
    exception when others then
      n_err := n_err + 1;
      if jsonb_array_length(errs) < 10 then errs := errs || jsonb_build_array(jsonb_build_object('name', it->>'name', 'error', sqlerrm)); end if;
    end;
  end loop;
  return jsonb_build_object('ingested', n, 'errors', n_err, 'error_samples', errs);
end $$;
revoke execute on function ingest_agents(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Rankings v2: add quality, price, free plan, value
-- ---------------------------------------------------------------------
drop view if exists v_theme_rankings;
drop view if exists v_task_rankings;
drop materialized view if exists mv_theme_rankings;
drop materialized view if exists mv_task_rankings;

create materialized view mv_task_rankings as
with req as (
  select r.from_id as task_id, r.to_id as capability_id
    from relations r where r.relation = 'requires_capability' and r.valid_to is null
), nreq as (select task_id, count(*) as n_req from req group by task_id),
prov as (
  select req.task_id, ac.from_id as provider_id,
         count(distinct req.capability_id) as matched,
         array_agg(distinct cap.name order by cap.name) as matched_capabilities,
         max(case ac.confidence when 'high' then 3 when 'medium' then 2 else 1 end) as best_conf
    from req
    join relations ac on ac.to_id = req.capability_id and ac.relation = 'has_capability' and ac.valid_to is null
    join entities cap on cap.id = req.capability_id
   group by req.task_id, ac.from_id
), base as (
  select t.slug as task_slug, t.name as task_name,
         e.id as provider_id, e.type as provider_type, e.slug as provider_slug, e.name as provider_name,
         e.short_description, e.last_seen_at, e.first_seen_at,
         e.attributes->'version'->>'value' as version,
         (e.attributes->'transport.remote'->'value')::text::boolean as remote,
         (e.attributes->'transport.local'->'value')::text::boolean  as local,
         p.matched, n.n_req,
         round(p.matched::numeric / n.n_req * 100) as coverage_pct,
         p.matched_capabilities,
         case p.best_conf when 3 then 'high' when 2 then 'medium' else 'low' end as match_confidence,
         case when exists (select 1 from observations o where o.entity_id = e.id and o.evidence_level = 'observed')
                or exists (select 1 from price_points pp where pp.entity_id = e.id and pp.evidence_level = 'observed')
              then 'verified' else 'declared' end as trust_level,
         (select s.score from score_history s where s.entity_id = e.id and s.score_type = 'agent_score' order by s.date desc, s.calculated_at desc limit 1) as quality_score,
         (select min(cp.amount) from v_current_prices cp where cp.entity_id = e.id and cp.interval = 'month' and cp.currency = 'USD' and cp.amount > 0) as from_usd_month,
         (exists (select 1 from v_current_prices cp where cp.entity_id = e.id and (cp.billing_model in ('free','open_source') or cp.amount = 0))) as has_free,
         (exists (select 1 from v_current_prices cp where cp.entity_id = e.id)) as has_pricing
    from prov p
    join nreq n on n.task_id = p.task_id
    join entities t on t.id = p.task_id and t.is_published
    join entities e on e.id = p.provider_id and e.is_published
)
select b.*,
       case when not b.has_pricing then null
            when b.quality_score >= 60 and (b.from_usd_month <= 50 or (b.from_usd_month is null and b.has_free)) then 'best'
            when b.quality_score >= 70 and b.from_usd_month > 50 then 'premium'
            when b.has_free then 'free'
            when b.from_usd_month is not null then 'fair'
            else null end as value_label
  from base b;
create unique index if not exists uq_mv_task_rankings on mv_task_rankings(task_slug, provider_id);
create index if not exists idx_mv_task_rankings_rank on mv_task_rankings(task_slug, coverage_pct desc, quality_score desc nulls last);
create view v_task_rankings as select * from mv_task_rankings;

create materialized view mv_theme_rankings as
select c.slug as theme_slug, c.name as theme,
       r.provider_id, r.provider_type, r.provider_slug, r.provider_name, r.short_description,
       r.version, r.remote, r.local, r.trust_level, r.quality_score, r.last_seen_at,
       r.from_usd_month, r.has_free, r.has_pricing, r.value_label,
       round(sum(r.coverage_pct) / 100.0, 2) as coverage_score,
       count(*) filter (where r.coverage_pct = 100) as tasks_fully_covered,
       count(*) as tasks_touched,
       max(r.coverage_pct) as best_coverage,
       (array_agg(r.task_name order by r.coverage_pct desc, r.task_name))[1:3] as top_tasks,
       exists (select 1 from relations x where x.from_id = r.provider_id and x.to_id = c.id and x.relation = 'in_category' and x.valid_to is null) as listed_in_theme
  from mv_task_rankings r
  join entities t on t.slug = r.task_slug and t.type = 'task'
  join relations rc on rc.from_id = t.id and rc.relation = 'in_category' and rc.valid_to is null
  join entities c on c.id = rc.to_id
 group by c.id, c.slug, c.name, r.provider_id, r.provider_type, r.provider_slug, r.provider_name, r.short_description,
          r.version, r.remote, r.local, r.trust_level, r.quality_score, r.last_seen_at,
          r.from_usd_month, r.has_free, r.has_pricing, r.value_label;
create unique index if not exists uq_mv_theme_rankings on mv_theme_rankings(theme_slug, provider_id);
create index if not exists idx_mv_theme_rankings_score on mv_theme_rankings(theme_slug, coverage_score desc);
create view v_theme_rankings as select * from mv_theme_rankings;

grant select on mv_task_rankings, mv_theme_rankings, v_task_rankings, v_theme_rankings to anon, authenticated;

-- public agent card (owner view, published only): identity, company, themes, price, score
drop view if exists v_agent_cards;
create view v_agent_cards as
select e.id, e.slug, e.name, e.short_description, e.website, e.last_verified_at, e.first_seen_at,
       (select c.name from relations r join entities c on c.id = r.to_id
         where r.from_id = e.id and r.relation = 'made_by' and r.valid_to is null limit 1) as company,
       (select array_agg(c.name order by c.name) from relations r join entities c on c.id = r.to_id
         where r.from_id = e.id and r.relation = 'in_category' and r.valid_to is null) as themes,
       (select array_agg(c.slug order by c.name) from relations r join entities c on c.id = r.to_id
         where r.from_id = e.id and r.relation = 'in_category' and r.valid_to is null) as theme_slugs,
       e.attributes->'protocol.api'->'value' as api,
       e.attributes->'protocol.mcp'->'value' as mcp,
       e.attributes->'open_source'->'value'  as open_source,
       e.attributes->'pricing.free_trial'->'value' as free_trial,
       e.attributes->'pricing.url'->>'value' as pricing_url,
       (select min(cp.amount) from v_current_prices cp where cp.entity_id = e.id and cp.interval = 'month' and cp.currency = 'USD' and cp.amount > 0) as from_usd_month,
       exists (select 1 from v_current_prices cp where cp.entity_id = e.id and (cp.billing_model in ('free','open_source') or cp.amount = 0)) as has_free,
       exists (select 1 from price_points pp where pp.entity_id = e.id and pp.evidence_level = 'observed') as pricing_verified,
       s.score as quality_score, s.confidence as score_confidence, s.methodology_version,
       s.components->'components' as score_components, s.components->'missing' as score_missing
  from entities e
  left join lateral (select * from score_history sh where sh.entity_id = e.id and sh.score_type = 'agent_score'
                     order by sh.date desc, sh.calculated_at desc limit 1) s on true
 where e.type = 'agent' and e.is_published;

create or replace view v_agent_prices as
select e.slug as agent_slug, cp.plan_name, cp.billing_model, cp.amount, cp.currency, cp.interval, cp.unit, cp.is_trial,
       cp.evidence_level, cp.observed_at, cp.last_confirmed_at
  from v_current_prices cp join entities e on e.id = cp.entity_id and e.type = 'agent' and e.is_published;

grant select on v_agent_cards, v_agent_prices to anon, authenticated;

select refresh_rankings();
