-- ELECTRA INDEX — affiliate links that are live (one line per accepted program).
-- Safe to re-run: each line replaces the previous link for that agent.
-- Paste into Supabase > SQL Editor > Run.

select set_affiliate_link('agent', 'firecrawl', 'https://firecrawl.link/dreamotion-ou');   -- Dub, 15% lifetime, accepted 2026-10-15
select set_affiliate_link('agent', (select slug from entities where type = 'agent' and name = 'Granola'),   'https://go.granola.ai/dreamotion-ou');    -- Dub, $20 per qualified lead, accepted 2026-10-17
select set_affiliate_link('agent', (select slug from entities where type = 'agent' and name = 'Julius AI'), 'https://julius.dub.link/dreamotion-ou');  -- Dub, 30% for 1 year, accepted 2026-10-17

select e.name, l.url, l.active from affiliate_links l join entities e on e.id = l.entity_id order by e.name;
