-- =====================================================================
-- 0015 — Value label: agents priced "on quote" get no value label
--        (there is no public price to judge value for money).
-- =====================================================================
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

select refresh_rankings();
