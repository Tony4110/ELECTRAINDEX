-- ELECTRA INDEX — FIX_AGENTS_BATCH_7 : Klaviyo Customer Agent as its own agent
--  In batch 7, "Klaviyo Customer Agent" shared the website klaviyo.com with the existing agent "Composer (Marketing Agent)",
--  so it was merged there. This removes what batch 7 added to Composer today, then lists Customer Agent on its own page.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

delete from price_points
 where entity_id = (select id from entities where type = 'agent' and slug = 'composer-marketing-agent')
   and evidence_url = 'https://www.klaviyo.com/solutions/ai/customer-agent' and observed_at >= '2026-11-18';
delete from observations
 where entity_id = (select id from entities where type = 'agent' and slug = 'composer-marketing-agent')
   and observed_at >= '2026-11-18' and (evidence_url = 'https://www.klaviyo.com/solutions/ai/customer-agent' or value = '"https://www.klaviyo.com/solutions/ai/customer-agent"'::jsonb);
delete from relations
 where from_id = (select id from entities where type = 'agent' and slug = 'composer-marketing-agent')
   and relation = 'has_capability' and evidence_url = 'https://www.klaviyo.com/solutions/ai/customer-agent' and first_seen_at >= '2026-11-18';
select compute_agent_score((select id from entities where type = 'agent' and slug = 'composer-marketing-agent'));

select ingest_agents('[{"name": "Klaviyo Customer Agent", "company": "Klaviyo", "website": "https://www.klaviyo.com/solutions/ai/customer-agent", "theme": "Customer Support", "themes": ["Customer Support"], "short_description": "AI customer service agent for e-commerce brands, built on Klaviyo''s customer data, that resolves support conversations and recommends products.", "capabilities": ["Customer Chat", "Ticket Triage", "E-commerce Management"], "pricing_url": "https://www.klaviyo.com/solutions/ai/customer-agent", "pricing_verified": true, "checked_at": "2026-11-18", "plans": [{"plan": "1,000 AI resolutions", "billing_model": "subscription", "amount": 700, "currency": "USD", "interval": "month", "unit": "per month", "is_trial": false}], "free_plan": null, "free_trial": null, "api": null, "mcp": null, "open_source": false, "github_repo": null, "notes": "Price read on klaviyo.com Customer Agent page 2026-11-18 ($700 for 1,000 AI resolutions a month, currency assumed USD).", "aliases": [{"type": "name", "value": "Klaviyo Customer Agent"}]}]'::jsonb);

select i18n_set('agent', (select e.slug from entities e where e.type = 'agent' and e.name = 'Klaviyo Customer Agent' order by e.first_seen_at desc limit 1), 'fr', 'short_description',
  'Agent IA de service client pour les marques e-commerce, construit sur les données clients de Klaviyo, qui règle les demandes et recommande des produits.',
  'AI customer service agent for e-commerce brands, built on Klaviyo''s customer data, that resolves support conversations and recommends products.');

select refresh_rankings();

select e.name, 'https://electraindex.com/agents/' || e.slug as page,
       (select count(*) from price_points p where p.entity_id = e.id) as price_rows,
       (select count(*) from entities x where x.type = 'agent' and x.is_published) as agents_total
  from entities e where e.type = 'agent' and (e.slug = 'composer-marketing-agent' or e.name = 'Klaviyo Customer Agent')
 order by e.name;
