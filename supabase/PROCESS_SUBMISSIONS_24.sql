-- ELECTRA INDEX — PROCESS_SUBMISSIONS_24 : "List your agent" request of 19 Nov 2026 — CMSHands
--  Listed (researched on its official pages, 19 Nov 2026):
--   * AI assistant inside the WordPress dashboard: you ask for a change, it shows a preview, nothing changes
--     until you approve; most changes undo in one click. Also watches the site and the WooCommerce store.
--   * Publisher identified: RankRolo Limited, Hong Kong (company no. 78233372). Free WordPress plugin (zip, sha256 published).
--   * Prices (USD, EUR option, excl. tax): Free $0 (10 changes/month per site); Pro $20/month or $200/year
--     (100 changes/month, 3 sites); Max $100/month or $1,000/year (500 changes/month, 15 sites); 55% off the first period.
--  When it becomes "listed", the publisher email (with the share kit) leaves automatically.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

select ingest_agents($agents$[{"name": "CMSHands", "company": "RankRolo Limited", "website": "https://cmshands.com", "theme": "Coding", "themes": ["Coding"],
  "short_description": "AI assistant in the WordPress dashboard: ask for a change, see a preview, approve it; most changes undo in one click. It also watches the site and the WooCommerce store.",
  "capabilities": ["Agentic Code Edits", "Code Generation", "E-commerce Management", "Task Automation"],
  "pricing_url": "https://cmshands.com/pricing", "pricing_verified": true, "checked_at": "2026-11-19",
  "plans": [
    {"plan": "Free", "billing_model": "free", "amount": 0, "currency": "USD", "interval": "month", "unit": "10 changes a month per site, email required, no card", "is_trial": false},
    {"plan": "Pro", "billing_model": "subscription", "amount": 20, "currency": "USD", "interval": "month", "unit": "100 changes a month, up to 3 sites ($9 the first month)", "is_trial": false},
    {"plan": "Pro", "billing_model": "subscription", "amount": 200, "currency": "USD", "interval": "year", "unit": "100 changes a month, up to 3 sites", "is_trial": false},
    {"plan": "Max", "billing_model": "subscription", "amount": 100, "currency": "USD", "interval": "month", "unit": "500 changes a month, up to 15 sites ($45 the first month)", "is_trial": false},
    {"plan": "Max", "billing_model": "subscription", "amount": 1000, "currency": "USD", "interval": "year", "unit": "500 changes a month, up to 15 sites", "is_trial": false}],
  "free_plan": true, "free_trial": null, "api": null, "mcp": null, "open_source": null, "github_repo": null,
  "notes": "Submitted via List your agent (2026-11-19). Official pricing page read 2026-11-19: USD by default, EUR option, prices excl. tax; 55% off the first month (monthly) or first year (yearly) for new customers. Publisher RankRolo Limited, Hong Kong. Works with WordPress 6.3+ and PHP 8.0+; does not edit Divi or Beaver Builder pages and makes no backups (per the publisher). Site repairs are approved by a person at CMSHands.",
  "aliases": [{"type": "domain", "value": "https://cmshands.com"}]}]$agents$::jsonb);

select i18n_set('agent', (select e.slug from entities e where e.type = 'agent' and e.website ilike '%cmshands.com%' order by e.first_seen_at desc limit 1), 'fr', 'short_description',
  'Assistant IA dans le tableau de bord WordPress : vous demandez une modification, voyez un aperçu et la validez ; la plupart s''annulent en un clic. Il surveille aussi le site et la boutique WooCommerce.',
  'AI assistant in the WordPress dashboard: ask for a change, see a preview, approve it; most changes undo in one click. It also watches the site and the WooCommerce store.');
select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'agent' and e.website ilike '%cmshands.com%' order by e.first_seen_at desc limit 1)
 where s.status in ('new', 'duplicate') and s.website ilike '%cmshands.com%';

select s.name, s.status, e.slug as page,
       (select count(*) from entities x where x.type = 'agent' and x.is_published) as agents_total,
       (select n.subject from notify_log n where n.kind = 'publisher_listed' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s left join entities e on e.id = s.entity_id
 where s.website ilike '%cmshands.com%';
