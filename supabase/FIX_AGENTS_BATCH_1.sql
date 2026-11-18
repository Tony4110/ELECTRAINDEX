-- ELECTRA INDEX — FIX_AGENTS_BATCH_1 : Microsoft 365 Copilot as its own agent
--  In batch 1, "Microsoft 365 Copilot" shared the website microsoft.com with the existing agent "Copilot in Outlook",
--  so the robot merged it there. This removes what batch 1 added to "Copilot in Outlook" today
--  (its prices, links and capabilities stay as they were before), then lists Microsoft 365 Copilot on its own page.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

-- 1. undo today's batch-1 additions on "Copilot in Outlook"
delete from price_points
 where entity_id = (select id from entities where type = 'agent' and slug = 'copilot-in-outlook')
   and evidence_url = 'https://www.microsoft.com/en-us/microsoft-365-copilot/pricing' and observed_at >= '2026-11-18';
delete from observations
 where entity_id = (select id from entities where type = 'agent' and slug = 'copilot-in-outlook')
   and observed_at >= '2026-11-18' and (evidence_url in ('https://www.microsoft.com/en-us/microsoft-365-copilot/pricing', 'https://www.microsoft.com/en-us/microsoft-365-copilot') or value in ('"https://www.microsoft.com/en-us/microsoft-365-copilot/pricing"'::jsonb, '"https://www.microsoft.com/en-us/microsoft-365-copilot"'::jsonb));
delete from relations
 where from_id = (select id from entities where type = 'agent' and slug = 'copilot-in-outlook')
   and relation = 'has_capability' and evidence_url = 'https://www.microsoft.com/en-us/microsoft-365-copilot' and first_seen_at >= '2026-11-18';
delete from entity_aliases
 where entity_id = (select id from entities where type = 'agent' and slug = 'copilot-in-outlook')
   and alias_type = 'name' and value = norm_alias('name', 'Microsoft 365 Copilot');
select compute_agent_score((select id from entities where type = 'agent' and slug = 'copilot-in-outlook'));

-- 2. Microsoft 365 Copilot on its own page (prices read on microsoft.com on 18 Nov 2026)
select ingest_agents('[{"name": "Microsoft 365 Copilot", "company": "Microsoft", "website": "https://www.microsoft.com/en-us/microsoft-365-copilot", "theme": "Productivity", "themes": ["Productivity"], "short_description": "AI assistant across Word, Excel, Outlook and Teams, with built-in agents such as Researcher (multi-step research) and Analyst (data analysis), and custom agents.", "capabilities": ["Web Research", "Report Generation", "Data Analysis", "Summarization", "Email Automation"], "pricing_url": "https://www.microsoft.com/en-us/microsoft-365-copilot/pricing", "pricing_verified": true, "checked_at": "2026-11-18", "plans": [{"plan": "Copilot Business add-on (annual)", "billing_model": "subscription", "amount": 18, "currency": "USD", "interval": "month", "unit": "per user, billed annually; promotional price until 31 Dec 2026, normally $21", "is_trial": false}, {"plan": "Copilot Business add-on (monthly)", "billing_model": "subscription", "amount": 25.2, "currency": "USD", "interval": "month", "unit": "per user, billed monthly", "is_trial": false}, {"plan": "Business Standard with Copilot (annual)", "billing_model": "subscription", "amount": 23.5, "currency": "USD", "interval": "month", "unit": "per user, billed annually", "is_trial": false}, {"plan": "Business Premium with Copilot (annual)", "billing_model": "subscription", "amount": 32, "currency": "USD", "interval": "month", "unit": "per user, billed annually", "is_trial": false}, {"plan": "Enterprise", "billing_model": "enterprise_quote", "amount": null, "currency": null, "interval": null, "unit": "price on request", "is_trial": false}], "free_plan": false, "free_trial": null, "api": null, "mcp": null, "open_source": false, "github_repo": null, "notes": "Prices read on microsoft.com/en-us/microsoft-365-copilot/pricing 2026-11-18 (USD, US market). Copilot Chat included at no extra cost with eligible Microsoft 365 plans.", "aliases": [{"type": "name", "value": "Microsoft 365 Copilot"}]}]'::jsonb);

select i18n_set('agent', (select e.slug from entities e where e.type = 'agent' and e.name = 'Microsoft 365 Copilot' order by e.first_seen_at desc limit 1), 'fr', 'short_description',
  'Assistant IA dans Word, Excel, Outlook et Teams, avec des agents intégrés comme Researcher (recherche en plusieurs étapes) et Analyst (analyse de données), et des agents sur mesure.',
  'AI assistant across Word, Excel, Outlook and Teams, with built-in agents such as Researcher (multi-step research) and Analyst (data analysis), and custom agents.');

select refresh_rankings();

-- 3. check
select e.name, 'https://electraindex.com/agents/' || e.slug as page,
       (select count(*) from price_points p where p.entity_id = e.id) as price_rows,
       (select count(*) from entities x where x.type = 'agent' and x.is_published) as agents_total
  from entities e where e.type = 'agent' and (e.slug = 'copilot-in-outlook' or e.name = 'Microsoft 365 Copilot')
 order by e.name;
