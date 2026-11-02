-- ELECTRA INDEX — PROCESS_SUBMISSIONS_11 : "List your agent" request of 2 Nov 2026
--  Listed (researched on its official pages, 2 Nov 2026):
--   * SoftSync AI (SoftSync AI Inc., Delaware, US): AI CRM + meeting assistant, Autopilot jobs, MCP server and API on every plan.
--     Pro $39/seat/month ($29 billed yearly), Business $79/seat/month ($59 billed yearly), Enterprise on quote. No free plan.
--  When it becomes "listed", the publisher email (with the share kit and the Spotlight offer) leaves automatically.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

select ingest_agents('[{"name": "SoftSync AI", "company": "SoftSync AI Inc.", "website": "https://softsync.ai", "theme": "Sales", "themes": ["Sales", "Productivity"], "short_description": "AI CRM and meeting assistant for founders and small teams: records calls without a bot, writes notes, updates deals and runs jobs via Autopilot, with an MCP server.", "capabilities": ["CRM Integration", "Speech Transcription", "Summarization", "Email Automation", "Workflow Orchestration", "API Integration"], "pricing_url": "https://softsync.ai/pricing", "pricing_verified": true, "checked_at": "2026-11-02", "plans": [{"plan": "Pro", "billing_model": "seat", "amount": 39, "currency": "USD", "interval": "month", "unit": "per seat, billed monthly (\u002429/seat/month billed yearly)", "is_trial": false}, {"plan": "Business", "billing_model": "seat", "amount": 79, "currency": "USD", "interval": "month", "unit": "per seat, billed monthly (\u002459/seat/month billed yearly)", "is_trial": false}, {"plan": "Enterprise", "billing_model": "enterprise_quote", "amount": null, "currency": null, "interval": null, "unit": "custom capacity and integrations", "is_trial": false}], "free_plan": false, "free_trial": null, "api": true, "mcp": true, "open_source": false, "github_repo": null, "notes": "Submitted via List your agent (2026-11-02). Prices read on softsync.ai/pricing 2026-11-02, USD excl. VAT. Company SoftSync AI Inc., Wilmington, Delaware, US (site footer). MCP and API included on every plan. Trial length not stated."}]'::jsonb);

select i18n_set('agent', (select e.slug from entities e where e.type = 'agent' and e.website ilike '%softsync.ai%' order by e.first_seen_at desc limit 1), 'fr', 'short_description', 'Assistant IA de CRM et de réunions pour fondateurs et petites équipes : enregistre les appels sans bot, rédige les notes, met à jour les affaires et exécute des tâches via Autopilot, avec un serveur MCP.', 'AI CRM and meeting assistant for founders and small teams: records calls without a bot, writes notes, updates deals and runs jobs via Autopilot, with an MCP server.');

select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'agent' and e.website ilike '%softsync.ai%' order by e.first_seen_at desc limit 1)
 where s.status in ('new', 'duplicate') and s.website ilike '%softsync.ai%';

select s.name, s.status, 'https://electraindex.com/agents/' || e.slug as page,
       (select n.subject from notify_log n where n.kind = 'publisher_listed' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s left join entities e on e.id = s.entity_id
 where s.website ilike '%softsync.ai%';
