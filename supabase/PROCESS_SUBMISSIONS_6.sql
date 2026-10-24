-- ELECTRA INDEX — PROCESS_SUBMISSIONS_6 : "List your agent" request of 24 Oct 2026
--  Listed (researched on its official pages, 24 Oct 2026):
--   * Mach (MachGTM) : AI sales teammate for B2B software teams — finds buyers, researches fit/intent/timing,
--     drafts messages and follow-ups, runs reviewed playbooks; the seller approves what goes out.
--     Starter $1,000/month (1 seat, 50 companies researched/month), Team $1,000 per seat/month (2-10 seats),
--     Company on quote. "Early-access pricing". No free plan shown.
--  When it becomes "listed", the publisher email (with the share kit) leaves automatically.
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable.

select ingest_agents($agents$[{"name": "Mach", "company": "MachGTM", "website": "https://machgtm.com", "theme": "Sales", "short_description": "AI sales teammate for B2B software teams: finds buyers already looking for what you sell, researches each one with sources, and drafts the first message and follow-ups for the seller to approve.", "capabilities": ["Lead Generation", "Lead Enrichment", "Outreach Sequencing", "Email Automation", "CRM Integration", "Web Research"], "pricing_url": "https://machgtm.com/pricing", "pricing_verified": true, "checked_at": "2026-10-24", "plans": [{"plan": "Starter", "billing_model": "subscription", "amount": 1000, "currency": "USD", "interval": "month", "unit": "1 seat, 50 companies researched per month (or $10,000/year)", "is_trial": false}, {"plan": "Team", "billing_model": "subscription", "amount": 1000, "currency": "USD", "interval": "month", "unit": "per seat, 2 to 10 seats, 50 companies researched per seat per month", "is_trial": false}], "free_plan": false, "free_trial": null, "api": null, "mcp": null, "open_source": null, "github_repo": null, "notes": "Submitted via List your agent (2026-10-24) by the founder. Official pricing page read 2026-10-24: Starter $1,000/month (1 seat) or $10,000/year; Team $1,000 per seat per month (2-10 seats); Company plan on quote; marked 'Early-access pricing, prices may change'. Currency shown as $. Channels: email, LinkedIn, WhatsApp; integrations Microsoft 365, Teams, Zoho CRM, Google Calendar, Calendly. Company country not stated.", "themes": ["Sales"], "aliases": [{"type": "domain", "value": "https://machgtm.com"}]}]$agents$::jsonb);
select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'agent' and e.name = s.name and e.website ilike '%machgtm%' limit 1)
 where s.status in ('new', 'duplicate') and s.name = 'Mach';

select s.name, s.status, e.slug as page,
       (select n.subject from notify_log n where n.kind = 'publisher_listed' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s left join entities e on e.id = s.entity_id
 where s.name = 'Mach';
