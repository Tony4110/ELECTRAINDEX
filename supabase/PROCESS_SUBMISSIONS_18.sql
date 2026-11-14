-- ELECTRA INDEX — PROCESS_SUBMISSIONS_18 : "List your agent" request of 13 Nov 2026 — ZeraBooks
--  Listed (checked on its official pages, 13 Nov 2026):
--   * Zera Books Inc., Vancouver, British Columbia, Canada (zerabooks.com/about), founded 2025 by Damin Mutti.
--   * AI-native general ledger + statement converter: categorizes, reconciles to the bank's printed balances, drafts month-end entries.
--   * $79/month billed annually (zerabooks.com/about); $149 month-to-month and 7-day trial as declared by the publisher.
--  Status "listed" sends the standard listing email automatically (badge first). Re-runnable.

select ingest_agents('[{"name": "ZeraBooks", "company": "Zera Books Inc.", "website": "https://www.zerabooks.com", "theme": "Finance", "themes": ["Finance", "Business Operations"], "short_description": "AI bookkeeping software that runs the books from uploaded bank and card statements: categorizes every transaction, reconciles to the printed balances to the cent and drafts month-end entries for review.", "capabilities": ["Bookkeeping", "Data Extraction", "Report Generation"], "pricing_url": "https://www.zerabooks.com/pricing", "pricing_verified": true, "checked_at": "2026-11-13", "plans": [{"plan": "ZeraBooks (annual)", "billing_model": "subscription", "amount": 79, "currency": "USD", "interval": "month", "unit": "billed annually, general ledger + converter", "is_trial": false}, {"plan": "ZeraBooks (monthly)", "billing_model": "subscription", "amount": 149, "currency": "USD", "interval": "month", "unit": "billed monthly", "is_trial": false}], "free_plan": false, "free_trial": "7 days", "api": null, "mcp": null, "open_source": false, "github_repo": null, "notes": "Submitted via List your agent (2026-11-13). Company Zera Books Inc., Vancouver, BC, Canada (zerabooks.com/about). $79/month billed annually read on zerabooks.com/about 2026-11-13; $149 monthly and 7-day trial declared in the submission. Privacy policy: zerabooks.com/privacy. Free setup and catch-up for new customers."}]'::jsonb);

select i18n_set('agent', (select e.slug from entities e where e.type = 'agent' and e.website ilike '%zerabooks.com%' order by e.first_seen_at desc limit 1), 'fr', 'short_description',
  'Logiciel de comptabilité IA qui tient les livres à partir des relevés bancaires et de cartes importés : catégorise chaque transaction, rapproche au centime avec les soldes imprimés et prépare les écritures de fin de mois pour validation.',
  'AI bookkeeping software that runs the books from uploaded bank and card statements: categorizes every transaction, reconciles to the printed balances to the cent and drafts month-end entries for review.');

select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'agent' and e.website ilike '%zerabooks.com%' order by e.first_seen_at desc limit 1)
 where s.status in ('new', 'duplicate') and s.website ilike '%zerabooks.com%';

select s.name, s.status, 'https://electraindex.com/agents/' || e.slug as page,
       (select n.subject from notify_log n where n.kind = 'publisher_listed' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s left join entities e on e.id = s.entity_id
 where s.website ilike '%zerabooks.com%';
