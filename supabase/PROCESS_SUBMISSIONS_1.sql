-- ELECTRA INDEX — PROCESS_SUBMISSIONS_1 : the first 4 "List your agent" requests (15 Oct 2026)
--  * roompano (AI agent): researched on its official pages, listed with prices.
--  * Arcmira, TwitterAPI.io, ScrapeAtlas (MCP servers): linked to their page when our registry robot already lists them.
-- Paste everything into Supabase > SQL Editor > Run.

select ingest_agents($agents$[{"name": "roompano", "company": "roompano", "website": "https://roompano.com/en", "theme": "Marketing", "short_description": "AI tool for real estate agents that turns phone photos into virtual home staging and 360 tours, with no 360 camera needed.", "capabilities": ["Image Generation"], "pricing_url": "https://roompano.com/en/pricing", "pricing_verified": true, "checked_at": "2026-10-15", "plans": [{"plan": "Starter", "billing_model": "free", "amount": 0, "currency": "USD", "interval": null, "unit": "2 free credits", "is_trial": false}, {"plan": "Independent", "billing_model": "subscription", "amount": 19, "currency": "USD", "interval": "month", "unit": "40 credits per month", "is_trial": false}, {"plan": "Pro", "billing_model": "subscription", "amount": 39, "currency": "USD", "interval": "month", "unit": "120 credits per month", "is_trial": false}], "free_plan": true, "free_trial": false, "api": null, "mcp": null, "open_source": null, "github_repo": null, "notes": "Submitted via List your agent (2026-10-10). Pricing read on the official page 2026-10-15: monthly billing only, prices excl. VAT, credits roll over. No API or MCP mentioned."}]$agents$::jsonb);
select refresh_rankings();

update submissions s set status = 'listed', reviewed_at = now(), entity_id = e.id
  from entities e
 where s.status = 'new' and s.name = 'roompano' and e.type = 'agent' and e.slug = 'roompano';

-- tools: listed if our registry robot already has them (same website domain, or same name in the registry id)
with m as (
  select s.id as sid,
         (select e.id from entities e
           where e.type = 'mcp_server' and e.is_published
             and (host_of(coalesce(e.website, e.attributes->'website.url'->>'value')) = host_of(s.website)
                  or e.slug = lower(regexp_replace(split_part(s.name, ':', 1), '[^a-zA-Z0-9]+', '-', 'g'))
                  or e.slug like lower(regexp_replace(split_part(s.name, '.', 1), '[^a-zA-Z0-9]+', '-', 'g')) || '%mcp%')
           order by e.last_seen_at desc limit 1) as eid
    from submissions s where s.status = 'new' and s.kind = 'tool'
)
update submissions s set status = 'listed', reviewed_at = now(), entity_id = m.eid
  from m where s.id = m.sid and m.eid is not null;

select s.name, s.status, e.type, e.slug, e.name as listed_as,
       e.attributes->'version'->>'value' as version, e.last_seen_at::date as last_seen
  from submissions s left join entities e on e.id = s.entity_id
 order by s.created_at desc;
