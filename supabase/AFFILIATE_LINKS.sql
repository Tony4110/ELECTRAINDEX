-- ELECTRA INDEX — affiliate links that are live (one line per accepted program).
-- Safe to re-run: each line replaces the previous link for that agent.
-- Paste into Supabase > SQL Editor > Run.

select set_affiliate_link('agent', 'firecrawl', 'https://firecrawl.link/dreamotion-ou');   -- Dub, 15% lifetime, accepted 2026-10-15

select e.name, l.url, l.active from affiliate_links l join entities e on e.id = l.entity_id order by e.name;
