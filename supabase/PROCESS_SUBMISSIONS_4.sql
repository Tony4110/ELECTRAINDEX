-- ELECTRA INDEX — PROCESS_SUBMISSIONS_4 : "List your agent" request of 23 Oct 2026
--  Listed (researched on its official pages, 23 Oct 2026):
--   * ClipTalk : AI short-video agent (Cliptalk.pro, Inc.) — prompt to ready-to-post TikTok / Reels / Shorts MP4.
--     Free: 50 credits (watermark). Starter $39/mo (8,000 credits), Pro $39/mo shown instead of $59 (14,000 credits,
--     AI agent, API, MCP), Ultra $199/mo (50,000 credits). Hosted MCP server (Streamable HTTP, OAuth sign-in).
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable.

select ingest_agents($agents$[{"name": "ClipTalk", "company": "Cliptalk.pro, Inc.", "website": "https://www.cliptalk.pro", "theme": "Marketing", "short_description": "AI video agent that turns a prompt, script, product page or link into a finished TikTok, Reels or YouTube Shorts video: script, AI visuals, voiceover, captions and music, rendered to a ready-to-post MP4.", "capabilities": ["Video Generation", "Content Writing", "Social Media Management", "API Integration"], "pricing_url": "https://www.cliptalk.pro/pricing", "pricing_verified": true, "checked_at": "2026-10-23", "plans": [{"plan": "Free", "billing_model": "free", "amount": 0, "currency": "USD", "interval": null, "unit": "50 credits to try, videos carry a watermark", "is_trial": false}, {"plan": "Starter", "billing_model": "subscription", "amount": 39, "currency": "USD", "interval": "month", "unit": "8,000 credits per month", "is_trial": false}, {"plan": "Pro", "billing_model": "subscription", "amount": 39, "currency": "USD", "interval": "month", "unit": "14,000 credits per month, AI agent, API and MCP access", "is_trial": false}, {"plan": "Ultra", "billing_model": "subscription", "amount": 199, "currency": "USD", "interval": "month", "unit": "50,000 credits per month, priority support", "is_trial": false}], "free_plan": true, "free_trial": false, "api": true, "mcp": true, "open_source": null, "github_repo": "https://github.com/payamsaremi/cliptalk-mcp", "notes": "Submitted via List your agent (2026-10-23). Pricing read on the official page 2026-10-23: Starter $39/mo, Pro shown at $39/mo next to $59 ('price locked in for life'), Ultra $199/mo; yearly prices behind a toggle, not recorded. Currency shown as $ (Cliptalk.pro, Inc.). Hosted MCP server https://www.cliptalk.pro/mcp (Streamable HTTP, OAuth 2.1 sign-in, no API key); REST API https://www.cliptalk.pro/api/v1. Company country not stated.", "themes": ["Marketing"], "aliases": [{"type": "domain", "value": "https://www.cliptalk.pro"}]}]$agents$::jsonb);
select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'agent' and e.name = s.name)
 where s.status = 'new' and s.name = 'ClipTalk';

select s.name, s.status, e.slug as page
  from submissions s left join entities e on e.id = s.entity_id
 where s.name = 'ClipTalk';
