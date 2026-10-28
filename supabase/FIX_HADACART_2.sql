-- ELECTRA INDEX — FIX_HADACART_2 : narrower use cases for Hadacart (28 Oct 2026)
-- "Web Research" matched ~20 unrelated tasks (real estate, leads, SEO articles...). Hadacart only searches and
-- compares shopping products, so we keep Price Monitoring only: Compare products online, Monitor prices.
-- Paste all in Supabase > SQL Editor > Run. Re-runnable.

select publisher_correction('mcp_server', 'hadacart-public-catalog-snapshots',
         array['web-research'], array['price-monitoring'],
         'https://hadacart.com/agents/', 'https://hadacart.com/agents/',
         'publisher request: shopping catalog search and price comparison only');

select e.slug, e.name,
       (select string_agg(p.capability, ', ' order by p.capability) from v_provider_capabilities p
         where p.provider_slug = e.slug and p.provider_type = 'mcp_server') as use_cases,
       (select string_agg(t.task_name, ', ' order by t.task_name) from v_task_rankings t where t.provider_id = e.id) as tasks
  from entities e
 where e.type = 'mcp_server' and e.slug like 'hadacart%'
 order by e.slug;
