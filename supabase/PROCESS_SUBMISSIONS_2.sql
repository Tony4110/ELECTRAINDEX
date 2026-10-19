-- ELECTRA INDEX — PROCESS_SUBMISSIONS_2 : 5 "List your agent" requests of 16 Oct 2026
--  Listed (researched on their official pages, 19 Oct 2026):
--   * HRBridge   : AI recruiter that calls driver applicants for Amazon DSPs (no public price -> "On quote")
--   * AnswerDojo : AI voice mock-interview coach (Free, $19 one-time sprint, Pro $99/year)
--  Not listed (Electra ranks AI agents that do a job; these are consumer apps, not agents):
--   * TypeOut     : type-to-speech app for people who cannot speak (no agent, no public price)
--   * Unmei Tarot : AI tarot readings (entertainment, prices not readable on the official page)
--   * Inkspira    : AI tattoo design generator (consumer image tool, credit packs)
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable.

select ingest_agents($agents$[{"name": "HRBridge", "company": "HRBridge", "website": "https://hrbridge.app/amazon-dsps", "theme": "Business Operations", "short_description": "AI recruiter for Amazon Delivery Service Partners that calls every eligible driver applicant, screens them with the DSP's own questions, follows up and moves hires through paperwork and training.", "capabilities": ["Voice Calls", "Resume Screening", "Outreach Sequencing", "Appointment Scheduling", "Automated Reminders"], "pricing_url": null, "pricing_verified": false, "checked_at": "2026-10-19", "plans": [], "free_plan": null, "free_trial": null, "api": null, "mcp": null, "open_source": null, "github_repo": null, "notes": "Submitted via List your agent (2026-10-16). Official page read 2026-10-19: no public pricing (ROI calculator only), managers keep final hiring decisions. Company country not stated.", "themes": ["Business Operations"], "aliases": [{"type": "domain", "value": "https://hrbridge.app"}]}, {"name": "AnswerDojo", "company": "AnswerDojo", "website": "https://answerdojo.com", "theme": "Productivity", "short_description": "AI mock interview coach for new graduates: builds stories from your résumé, runs live voice mock interviews tailored to a company and role, and scores each answer with feedback.", "capabilities": ["Chat Assistant", "Document Generation", "Speech Transcription"], "pricing_url": "https://answerdojo.com/en/pricing", "pricing_verified": true, "checked_at": "2026-10-19", "plans": [{"plan": "Free", "billing_model": "free", "amount": 0, "currency": "USD", "interval": null, "unit": "2 voice mock interviews (lifetime)", "is_trial": false}, {"plan": "7-Day Sprint", "billing_model": "one_time", "amount": 19, "currency": "USD", "interval": null, "unit": "10 voice mock interviews over 7 days", "is_trial": false}, {"plan": "Pro", "billing_model": "subscription", "amount": 99, "currency": "USD", "interval": "year", "unit": "20 voice mock interviews per month", "is_trial": false}], "free_plan": true, "free_trial": false, "api": null, "mcp": null, "open_source": null, "github_repo": null, "notes": "Submitted via List your agent (2026-10-16). Pricing read on the official page 2026-10-19: Pro shown at $99/year; a monthly toggle exists but no monthly price is displayed. Company country not stated.", "themes": ["Productivity"], "aliases": [{"type": "domain", "value": "https://answerdojo.com"}]}]$agents$::jsonb);
select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'agent' and e.name = s.name)
 where s.status = 'new' and s.name in ('HRBridge', 'AnswerDojo');

update submissions set status = 'rejected', reviewed_at = now()
 where status = 'new' and name in ('TypeOut', 'Unmei Tarot', 'Inkspira');

select s.name, s.status, e.slug as page
  from submissions s left join entities e on e.id = s.entity_id
 where s.created_at::date = '2026-10-16'
 order by s.status, s.name;
