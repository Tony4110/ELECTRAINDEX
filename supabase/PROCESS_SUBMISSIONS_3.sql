-- ELECTRA INDEX — PROCESS_SUBMISSIONS_3 : "List your agent" request of 19 Oct 2026
--  Listed (researched on its official pages, 22 Oct 2026):
--   * Bottally : AI SEO & AI-visibility agent (Bottally, Inc.) — one plan, Pro $99/month
--     (was $299, shown struck through), no free plan or trial shown; REST API + hosted MCP server.
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable.

select ingest_agents($agents$[{"name": "Bottally", "company": "Bottally, Inc.", "website": "https://www.bottally.com", "theme": "Marketing", "short_description": "AI SEO agent for founders and marketing teams: researches keywords, audits the site, writes and publishes one article a day to your blog, and tracks whether ChatGPT, Google AI and Perplexity mention your brand.", "capabilities": ["SEO Content", "SEO Optimization", "Content Writing", "Competitor Monitoring", "API Integration"], "pricing_url": "https://www.bottally.com/pricing", "pricing_verified": true, "checked_at": "2026-10-22", "plans": [{"plan": "Pro", "billing_model": "subscription", "amount": 99, "currency": "USD", "interval": "month", "unit": "30 articles per month, weekly AI visibility tracking (4 AI engines), unlimited users", "is_trial": false}], "free_plan": false, "free_trial": false, "api": true, "mcp": true, "open_source": null, "github_repo": null, "notes": "Submitted via List your agent (2026-10-19). Official pages read 2026-10-22: one Pro plan at $99/mo (previous price $299 shown struck through), custom plans on request, no free plan or trial shown; currency shown as $ (Bottally, Inc.). REST API https://www.bottally.com/api/v1 and MCP server https://www.bottally.com/api/mcp (Streamable HTTP, bearer key). Company country not stated.", "themes": ["Marketing"], "aliases": [{"type": "domain", "value": "https://www.bottally.com"}]}]$agents$::jsonb);
select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'agent' and e.name = s.name)
 where s.status = 'new' and s.name = 'Bottally';

select s.name, s.status, e.slug as page
  from submissions s left join entities e on e.id = s.entity_id
 where s.name = 'Bottally';
