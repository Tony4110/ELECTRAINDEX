-- ELECTRA — Robot Capability v1.1 : mots-clés plus précis + classement par score de couverture
-- Coller en entier dans Supabase SQL Editor puis Run. Réexécutable sans risque.

-- =====================================================================
-- 0012 — Robot Capability v1.1 (kw-v2)
--  * Tighter patterns for generic capabilities ("reports", "analytics",
--    "workflows", "tickets") that pulled unrelated tools into themes.
--  * Old kw-v1 links are removed and everything is re-classified with kw-v2
--    (the 10-minute cron does it in batches of 5,000).
--  * Theme ranking now uses a coverage score = sum of task coverage across
--    the theme (breadth first), instead of "one task fully covered".
-- =====================================================================

update capability_patterns set pattern = v.p, version = 'kw-v2'
from (values
 ('report-generation',      '\m(report generation|generate (reports?|pdf reports?)|reporting (dashboards?|automation)|(seo|marketing|sales|financial|analytics|campaign|weekly|monthly|custom) reports?)\M'),
 ('data-analysis',          '\m(data analysis|analy[sz]e (your )?data|data analytics|business intelligence|pandas|tableau|power ?bi|looker|metabase|posthog|mixpanel|amplitude|google analytics|ga4|web analytics|marketing analytics|product analytics)\M'),
 ('workflow-orchestration', '\m(workflow automation|automate (your )?workflows?|zapier|n8n|make\.com|pipedream|orchestrat(e|ion|or)|workflow (builder|engine))\M'),
 ('ticket-triage',          '\m(support tickets?|ticketing|issue track(er|ing)|jira|linear|servicenow|zendesk|triage|help ?desk tickets?)\M'),
 ('knowledge-base-qa',      '\m(knowledge bases?|rag|vector (search|stores?|databases?|db)|semantic search|notion|confluence|obsidian|docs search|documentation search|question answering)\M'),
 ('email-automation',       '\m(e-?mail (automation|campaigns?|marketing|sending|inbox)|send e-?mails?|gmail|outlook mail|smtp|imap|mailchimp|sendgrid|resend|postmark|brevo|klaviyo)\M'),
 ('devops-automation',      '\m(devops|ci/cd|deploy(ment|ments|s)?|kubernetes|k8s|docker|terraform|helm|ansible|vercel|netlify|cloudflare workers|aws (lambda|ecs|ec2|cdk)|infrastructure as code)\M'),
 ('forecasting',            '\m((sales|demand|revenue|financial|budget) forecast(s|ing)?|forecast(ing)? (sales|demand|revenue)|predictive (analytics|models?)|time[- ]series)\M'),
 ('api-integration',        '\m(api integration|openapi|rest api|graphql|webhooks?|swagger|postman|api client|any api|connect (any|your) api)\M')
) as v(slug, p)
where capability_patterns.capability_slug = v.slug;
update capability_patterns set version = 'kw-v2';

-- classifier now takes a method name (kw-v2 by default)
create or replace function classify_capabilities_keywords(p_limit int default 5000, p_method text default 'kw-v2')
returns jsonb language plpgsql as $$
declare v_src uuid := source_id_of('SRC-001'); n_ent int; n_links int;
begin
  create temporary table _batch on commit drop as
    select e.id, lower(e.name || ' ' || coalesce(e.short_description, '') || ' ' || coalesce(e.description, '')) as txt
      from entities e
     where e.type in ('mcp_server','agent') and e.is_published
       and not exists (select 1 from classification_log l where l.entity_id = e.id and l.method = p_method)
     order by e.first_seen_at
     limit p_limit;
  get diagnostics n_ent = row_count;

  insert into relations(from_id, relation, to_id, evidence_level, confidence, source_id, evidence)
  select b.id, 'has_capability', c.id, 'derived', 'low', v_src,
         p_method || ': ' || (regexp_match(b.txt, p.pattern))[1]
    from _batch b
    join capability_patterns p on b.txt ~ p.pattern
    join entities c on c.type = 'capability' and c.slug = p.capability_slug
  on conflict (from_id, relation, to_id, evidence_level) do nothing;
  get diagnostics n_links = row_count;

  insert into classification_log(entity_id, method, n_capabilities)
  select b.id, p_method, (select count(*) from relations r where r.from_id = b.id and r.relation = 'has_capability' and r.valid_to is null)
    from _batch b
  on conflict (entity_id, method) do update set classified_at = now(), n_capabilities = excluded.n_capabilities;

  return jsonb_build_object('method', p_method, 'classified', n_ent, 'links', n_links,
    'remaining', (select count(*) from entities e where e.type in ('mcp_server','agent') and e.is_published
                   and not exists (select 1 from classification_log l where l.entity_id = e.id and l.method = p_method)));
end $$;
drop function if exists classify_capabilities_keywords(int);
revoke execute on function classify_capabilities_keywords(int, text) from public, anon, authenticated;

-- remove kw-v1 links (they will be rebuilt by kw-v2); keep the log for history
delete from relations where relation = 'has_capability' and evidence_level = 'derived' and evidence like 'keyword-v1:%';

-- theme ranking with a breadth-first coverage score
drop view if exists v_theme_rankings;
drop materialized view if exists mv_theme_rankings;
create materialized view mv_theme_rankings as
select c.slug as theme_slug, c.name as theme,
       r.provider_id, r.provider_type, r.provider_slug, r.provider_name, r.short_description,
       r.version, r.remote, r.local, r.trust_level, r.quality_score, r.last_seen_at,
       round(sum(r.coverage_pct) / 100.0, 2) as coverage_score,
       count(*) filter (where r.coverage_pct = 100) as tasks_fully_covered,
       count(*) as tasks_touched,
       max(r.coverage_pct) as best_coverage,
       (array_agg(r.task_name order by r.coverage_pct desc, r.task_name))[1:3] as top_tasks
  from mv_task_rankings r
  join entities t on t.slug = r.task_slug and t.type = 'task'
  join relations rc on rc.from_id = t.id and rc.relation = 'in_category' and rc.valid_to is null
  join entities c on c.id = rc.to_id
 group by c.slug, c.name, r.provider_id, r.provider_type, r.provider_slug, r.provider_name, r.short_description,
          r.version, r.remote, r.local, r.trust_level, r.quality_score, r.last_seen_at;
create unique index if not exists uq_mv_theme_rankings on mv_theme_rankings(theme_slug, provider_id);
create index if not exists idx_mv_theme_rankings_score on mv_theme_rankings(theme_slug, coverage_score desc, tasks_fully_covered desc);
create view v_theme_rankings as select * from mv_theme_rankings;
grant select on mv_theme_rankings, v_theme_rankings to anon, authenticated;

-- first batch now
select classify_capabilities_keywords(5000, 'kw-v2');
select refresh_rankings();

-- 0013 — Capability robot cron now runs kw-v2 (project-specific, needs pg_cron)
select cron.unschedule(jobid) from cron.job where jobname = 'intendex-capabilities';
select cron.schedule('intendex-capabilities', '*/10 * * * *',
  $job$ select classify_capabilities_keywords(5000, 'kw-v2'); select refresh_rankings(); $job$);


select theme, tasks, providers from v_theme_overview order by providers desc;
