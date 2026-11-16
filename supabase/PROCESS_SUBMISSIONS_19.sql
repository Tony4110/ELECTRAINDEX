-- ELECTRA INDEX — PROCESS_SUBMISSIONS_19 : listing request received by email on 16 Nov 2026 — Questry AI (no form submission)
--  Listed as an AI agent (theme Sales), checked on its official pages, 16 Nov 2026 (questry.ai/en/ai-sdr):
--   * AI SDR for B2B companies selling to the Dutch market: finds companies and decision-makers, writes and sends emails,
--     follows up and books meetings in the calendar; the customer leads the conversation.
--   * Start EUR 299/month (EUR 249 billed annually) · Groei EUR 649 (EUR 540) · Schaal EUR 995 (EUR 829), excl. VAT;
--     no setup fee; monthly billing at least 3 months; no free plan or trial stated.
--   * Publisher: Questry AI, Amsterdam, Netherlands, KvK 42192779. Privacy policy: questry.ai/privacy.
--  No submission row exists (the request came by email), so no automatic email: reply by hand with the page link.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

select ingest_agents('[{"name": "Questry AI", "company": "Questry AI (KvK 42192779, Amsterdam, Netherlands)", "website": "https://questry.ai", "theme": "Sales", "themes": ["Sales"], "short_description": "AI SDR for B2B companies selling to the Dutch market: finds companies and decision-makers, writes and sends each email, follows up and books the meeting in your calendar.", "capabilities": ["Lead Generation", "Outreach Sequencing", "Email Automation", "Meeting Scheduling", "Lead Enrichment"], "pricing_url": "https://questry.ai/en/ai-sdr", "pricing_verified": true, "checked_at": "2026-11-16", "plans": [{"plan": "Start (annual)", "billing_model": "subscription", "amount": 249, "currency": "EUR", "interval": "month", "unit": "billed annually, 500 new companies a month, excl. VAT", "is_trial": false}, {"plan": "Start (monthly)", "billing_model": "subscription", "amount": 299, "currency": "EUR", "interval": "month", "unit": "500 new companies a month, min. 3 months, excl. VAT", "is_trial": false}, {"plan": "Groei (annual)", "billing_model": "subscription", "amount": 540, "currency": "EUR", "interval": "month", "unit": "billed annually, 1,500 new companies a month, excl. VAT", "is_trial": false}, {"plan": "Groei (monthly)", "billing_model": "subscription", "amount": 649, "currency": "EUR", "interval": "month", "unit": "1,500 new companies a month, min. 3 months, excl. VAT", "is_trial": false}, {"plan": "Schaal (annual)", "billing_model": "subscription", "amount": 829, "currency": "EUR", "interval": "month", "unit": "billed annually, 3,000 new companies a month, excl. VAT", "is_trial": false}, {"plan": "Schaal (monthly)", "billing_model": "subscription", "amount": 995, "currency": "EUR", "interval": "month", "unit": "3,000 new companies a month, min. 3 months, excl. VAT", "is_trial": false}], "free_plan": false, "free_trial": null, "api": null, "mcp": null, "open_source": false, "github_repo": null, "notes": "Listing requested by email (Luuk, 2026-11-16). Prices read on questry.ai/en/ai-sdr 2026-11-16: EUR excl. VAT, no setup fee, monthly billing minimum 3 months. Publisher Questry AI, Amsterdam, KvK 42192779. Privacy policy questry.ai/privacy."}]'::jsonb);

select i18n_set('agent', (select e.slug from entities e where e.type = 'agent' and e.website ilike '%questry.ai%' order by e.first_seen_at desc limit 1), 'fr', 'short_description',
  'SDR IA pour les entreprises B2B qui vendent sur le marché néerlandais : trouve les entreprises et les décideurs, rédige et envoie chaque e-mail, relance et place le rendez-vous dans votre agenda.',
  'AI SDR for B2B companies selling to the Dutch market: finds companies and decision-makers, writes and sends each email, follows up and books the meeting in your calendar.');

select refresh_rankings();

select e.name, 'https://electraindex.com/agents/' || e.slug as page
  from entities e where e.type = 'agent' and e.website ilike '%questry.ai%';
