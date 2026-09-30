-- =====================================================================
-- 0010 — Robot Capability v1 : classement par mots-clés (sans IA, sans coût)
-- Links each published MCP server to the capabilities its name/description
-- mentions. Links are DERIVED, confidence LOW, and carry the matched words as
-- evidence. v2 (LLM) will later upgrade them to higher confidence.
-- Also: ranking read models for theme and task pages.
-- =====================================================================

-- one regex per capability (PostgreSQL ARE, case-insensitive match on name + description)
create table if not exists capability_patterns (
  capability_slug text primary key,
  pattern         text not null,
  version         text not null default 'kw-v1'
);

insert into capability_patterns(capability_slug, pattern) values
('web-research',            '\m(web search|search the web|internet search|search engines?|google search|bing search|brave search|tavily|serp ?api|exa search|perplexity|deep research)\M'),
('web-scraping',            '\m(scrap(e|er|ers|ing)|crawl(er|ers|ing)?|firecrawl|html to markdown|fetch (web ?pages?|urls?|websites?)|extract (content|data|text) from (the )?(web|websites?|pages?|urls?))\M'),
('browser-automation',      '\m(browsers?|playwright|puppeteer|selenium|headless|chrome devtools|browserbase)\M'),
('computer-use',            '\m(computer use|desktop automation|mouse and keyboard|screen control|gui automation|applescript|macos automation|control (your|the) (computer|desktop))\M'),
('data-extraction',         '\m(extract(ion|s)? (data|text|information|fields|entities|tables)|structured data|ocr|data extraction)\M'),
('document-understanding',  '\m(pdfs?|docx|word documents?|documents? (parsing|analysis|understanding|processing)|contracts?|ocr)\M'),
('data-analysis',           '\m(analytics|data analysis|analy[sz]e data|pandas|statistics|dashboards?|tableau|power ?bi|looker|metabase|posthog|mixpanel|amplitude)\M'),
('sql-querying',            '\m(sql|postgres(ql)?|mysql|sqlite|bigquery|snowflake|clickhouse|databases?|supabase|duckdb|redshift|mssql|mongodb|neon)\M'),
('spreadsheet-automation',  '\m(spreadsheets?|excel|google sheets|airtable|csv files?|xlsx)\M'),
('forecasting',             '\m((sales|demand|revenue|financial|budget) forecast(s|ing)?|forecast(ing)? (sales|demand|revenue)|predictive (analytics|models?)|time[- ]series)\M'),
('report-generation',       '\m(reports?|reporting)\M'),
('summarization',           '\m(summari[sz](e|es|ation|ing|er))\M'),
('translation',             '\m(translat(e|es|ion|ions|or|ing)|multilingual|deepl|locali[sz]ation)\M'),
('content-writing',         '\m(blog (posts?|articles?)|copywriting|content (creation|generation|writing)|write (blog|articles?|posts?|content)|wordpress|ghost cms|headless cms|contentful|sanity)\M'),
('seo-optimization',        '\m(seo|search console|keyword research|ahrefs|semrush|backlinks?)\M'),
('image-generation',        '\m(image generation|generate images?|text[- ]to[- ]image|dall-?e|stable diffusion|midjourney|flux|imagen|image editing|ideogram)\M'),
('video-generation',        '\m(video generation|generate videos?|text[- ]to[- ]video|runway|sora|heygen|synthesia|video editing|veo)\M'),
('voice-calls',             '\m(phone calls?|voice calls?|twilio|telephony|voip|call center|vapi|retell|outbound calls?|make calls)\M'),
('speech-transcription',    '\m(transcri(be|bes|ption|ptions|bing)|speech[- ]to[- ]text|whisper|audio to text|meeting notes)\M'),
('email-automation',        '\m(e-?mails?|gmail|outlook mail|smtp|imap|mailchimp|sendgrid|resend|postmark|inbox)\M'),
('social-media-management', '\m(twitter|linkedin|instagram|facebook|tiktok|social media|bluesky|threads|reddit|mastodon|youtube)\M'),
('influencer-discovery',    '\m(influencers?|creator discovery|find creators)\M'),
('lead-generation',         '\m(leads?|prospect(s|ing)?|lead gen(eration)?|apollo\.io|hunter\.io|b2b (data|contacts?)|contact finder|find (emails?|contacts?))\M'),
('lead-enrichment',         '\m(enrich(ment|es)?|clearbit|company data|firmographics?|people data|contact data)\M'),
('lead-scoring',            '\m(lead scor(e|ing)|qualify (leads?|prospects?)|lead qualification)\M'),
('crm-integration',         '\m(crm|salesforce|hubspot|pipedrive|zoho crm|attio|close\.com|dynamics 365)\M'),
('outreach-sequencing',     '\m(outreach|cold (e-?mails?|outreach)|email sequences?|instantly|lemlist|smartlead|drip campaigns?)\M'),
('meeting-scheduling',      '\m(schedul(e|es|ing) (meetings?|calls?|appointments?)|calendly|cal\.com|book(ing)? (meetings?|appointments?)|appointments?)\M'),
('calendar-management',     '\m(calendars?|google calendar|outlook calendar|caldav|ical)\M'),
('customer-chat',           '\m(customer (support|service|chat)|live chat|chatbots?|intercom|zendesk|freshdesk|crisp|help ?desk)\M'),
('ticket-triage',           '\m(tickets?|ticketing|issue track(er|ing)|jira|linear|servicenow|zendesk|triage)\M'),
('knowledge-base-qa',       '\m(knowledge bases?|rag|retrieval|vector (search|stores?|databases?|db)|embeddings?|semantic search|notion|confluence|obsidian|docs search|documentation search)\M'),
('code-generation',         '\m(code generation|generate code|coding (assistant|agent)?|codegen|scaffold(ing)?|boilerplate|write code)\M'),
('code-review',             '\m(code reviews?|pull requests?|github|gitlab|bitbucket|linters?|linting|static analysis)\M'),
('test-generation',         '\m(unit tests?|test generation|generate tests?|testing framework|e2e tests?|end[- ]to[- ]end tests?|test cases?|qa automation)\M'),
('debugging',               '\m(debug(ging|ger)?|error tracking|sentry|stack traces?|observability|datadog|new relic|log (analysis|search|management)|logging)\M'),
('devops-automation',       '\m(devops|ci/cd|deploy(ment|ments|s)?|kubernetes|k8s|docker|terraform|aws|azure|gcp|google cloud|cloudflare|vercel|netlify|infrastructure|helm|ansible)\M'),
('security-scanning',       '\m(security|vulnerabilit(y|ies)|cves?|pentest(ing)?|secrets? (detection|scanning)|sast|owasp|malware|threat intel(ligence)?)\M'),
('workflow-orchestration',  '\m(workflows?|zapier|n8n|make\.com|orchestrat(e|ion|or)|pipelines?|automations?)\M'),
('api-integration',         '\m(api integration|openapi|rest api|graphql|webhooks?|swagger|postman|api client|any api)\M'),
('payments',                '\m(payments?|stripe|paypal|checkout|x402|crypto payments?|wallets?|lightning network|pay per call)\M'),
('invoicing',               '\m(invoic(e|es|ing)|billing|quickbooks|xero|freshbooks)\M'),
('bookkeeping',             '\m(bookkeeping|accounting|ledger|quickbooks|xero|expenses?|receipts?)\M'),
('price-monitoring',        '\m(price (tracking|monitoring|comparison|alerts?|data|history)|market prices?|stock prices?|crypto prices?|exchange rates?)\M'),
('e-commerce-management',   '\m(e-?commerce|shopify|woocommerce|amazon seller|product catalogs?|online stores?|order management|inventory)\M'),
('procurement',             '\m(procurement|purchasing|suppliers?|vendor management|rfqs?|purchase orders?|tenders?)\M'),
('travel-booking',          '\m(travel|flights?|hotels?|booking\.com|airbnb|expedia|itinerar(y|ies))\M'),
('candidate-sourcing',      '\m(recruit(ing|ment|er|ers)?|candidates?|talent (acquisition|sourcing)|job (search|boards?|postings?|listings?)|applicant tracking|greenhouse|lever\.co)\M'),
('resume-screening',        '\m(resumes?|cvs?|applicants?|candidate screening)\M'),
('competitor-monitoring',   '\m(competitors?|competitive intelligence|market intelligence|brand monitoring|brand mentions?)\M')
on conflict (capability_slug) do update set pattern = excluded.pattern, version = excluded.version;

-- which entities were classified, by which method
create table if not exists classification_log (
  entity_id     uuid not null references entities(id) on delete cascade,
  method        text not null,
  classified_at timestamptz not null default now(),
  n_capabilities int not null default 0,
  primary key (entity_id, method)
);
alter table capability_patterns enable row level security;
alter table classification_log  enable row level security;

-- ---------------------------------------------------------------------
-- classify a batch of not-yet-classified published MCP servers
-- ---------------------------------------------------------------------
create or replace function classify_capabilities_keywords(p_limit int default 5000)
returns jsonb language plpgsql as $$
declare v_src uuid := source_id_of('SRC-001'); n_ent int; n_links int;
begin
  create temporary table _batch on commit drop as
    select e.id, lower(e.name || ' ' || coalesce(e.short_description, '') || ' ' || coalesce(e.description, '')) as txt
      from entities e
     where e.type in ('mcp_server','agent') and e.is_published
       and not exists (select 1 from classification_log l where l.entity_id = e.id and l.method = 'kw-v1')
     order by e.first_seen_at
     limit p_limit;
  get diagnostics n_ent = row_count;

  insert into relations(from_id, relation, to_id, evidence_level, confidence, source_id, evidence)
  select b.id, 'has_capability', c.id, 'derived', 'low', v_src,
         'keyword-v1: ' || (regexp_match(b.txt, p.pattern))[1]
    from _batch b
    join capability_patterns p on b.txt ~ p.pattern
    join entities c on c.type = 'capability' and c.slug = p.capability_slug
  on conflict (from_id, relation, to_id, evidence_level) do nothing;
  get diagnostics n_links = row_count;

  insert into classification_log(entity_id, method, n_capabilities)
  select b.id, 'kw-v1', (select count(*) from relations r where r.from_id = b.id and r.relation = 'has_capability' and r.valid_to is null)
    from _batch b
  on conflict (entity_id, method) do update set classified_at = now(), n_capabilities = excluded.n_capabilities;

  return jsonb_build_object('classified', n_ent, 'links', n_links,
    'remaining', (select count(*) from entities e where e.type in ('mcp_server','agent') and e.is_published
                   and not exists (select 1 from classification_log l where l.entity_id = e.id and l.method = 'kw-v1')));
end $$;
revoke execute on function classify_capabilities_keywords(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Ranking read models (owner views: they filter published rows themselves)
-- ---------------------------------------------------------------------

-- every provider (MCP server or agent) that covers a task, with coverage %
-- materialized (refreshed by refresh_rankings()) so pages stay instant with 30k+ providers
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
)
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
       -- trust level shown on the site
       case when exists (select 1 from observations o where o.entity_id = e.id and o.evidence_level = 'observed') then 'verified'
            else 'declared' end as trust_level,
       (select s.score from score_history s where s.entity_id = e.id and s.score_type = 'agent_score' order by s.date desc limit 1) as quality_score
  from prov p
  join nreq n on n.task_id = p.task_id
  join entities t on t.id = p.task_id and t.is_published
  join entities e on e.id = p.provider_id and e.is_published;
create unique index if not exists uq_mv_task_rankings on mv_task_rankings(task_slug, provider_id);
create index if not exists idx_mv_task_rankings_rank on mv_task_rankings(task_slug, coverage_pct desc, last_seen_at desc);
create view v_task_rankings as select * from mv_task_rankings;

-- theme (category) overview: tasks, providers per theme
create or replace view v_theme_overview as
select c.slug as theme_slug, c.name as theme,
       count(distinct t.id) as tasks,
       count(distinct ac.from_id) filter (where pe.is_published) as providers
  from entities c
  join relations rc on rc.to_id = c.id and rc.relation = 'in_category' and rc.valid_to is null
  join entities t on t.id = rc.from_id and t.type = 'task' and t.is_published
  left join relations rq on rq.from_id = t.id and rq.relation = 'requires_capability' and rq.valid_to is null
  left join relations ac on ac.to_id = rq.to_id and ac.relation = 'has_capability' and ac.valid_to is null
  left join entities pe on pe.id = ac.from_id
 where c.type = 'category' and c.is_published
 group by c.slug, c.name;

-- providers ranked inside a theme: best coverage across the theme's tasks
create materialized view mv_theme_rankings as
select c.slug as theme_slug, c.name as theme,
       r.provider_id, r.provider_type, r.provider_slug, r.provider_name, r.short_description,
       r.version, r.remote, r.local, r.trust_level, r.quality_score, r.last_seen_at,
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
create index if not exists idx_mv_theme_rankings_rank on mv_theme_rankings(theme_slug, tasks_fully_covered desc, tasks_touched desc);
create view v_theme_rankings as select * from mv_theme_rankings;

create or replace function refresh_rankings() returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_task_rankings;
  refresh materialized view concurrently mv_theme_rankings;
end $$;
revoke execute on function refresh_rankings() from public, anon, authenticated;

-- provider capabilities (for server/agent pages)
create or replace view v_provider_capabilities as
select e.slug as provider_slug, e.type as provider_type, cap.slug as capability_slug, cap.name as capability,
       r.evidence_level, r.confidence, r.evidence
  from relations r
  join entities e on e.id = r.from_id and e.is_published
  join entities cap on cap.id = r.to_id and cap.type = 'capability'
 where r.relation = 'has_capability' and r.valid_to is null;

-- capability counts now include MCP servers
create or replace view v_capabilities as
select cap.id, cap.slug, cap.name,
       (select count(*) from relations r where r.to_id = cap.id and r.relation = 'requires_capability' and r.valid_to is null) as tasks_count,
       (select count(*) from relations r join entities a on a.id = r.from_id
         where r.to_id = cap.id and r.relation = 'has_capability' and r.valid_to is null and a.is_published) as providers_count
from entities cap
where cap.type = 'capability' and cap.is_published;

grant select on mv_task_rankings, mv_theme_rankings, v_task_rankings, v_theme_overview, v_theme_rankings, v_provider_capabilities, v_capabilities to anon, authenticated;

create index if not exists idx_rel_hascap on relations(to_id) where relation = 'has_capability' and valid_to is null;
create index if not exists idx_rel_hascap_from on relations(from_id) where relation = 'has_capability' and valid_to is null;
