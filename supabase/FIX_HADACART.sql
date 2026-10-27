-- ELECTRA INDEX — FIX_HADACART : publisher correction requested by Hadacart / Hadasoft (27 Oct 2026)
-- Verified on https://hadacart.com/agents/ (read 27 Oct 2026): 4 public read-only MCP tools
-- (find_buying_guides, search_products, get_product, find_purchase_candidates); the page states it has
-- no cart, payment, fraud-detection, refund or order-execution tool.
-- -> remove payment / fraud / refund / reconciliation use cases, add product search & price comparison.
-- Paste all in Supabase > SQL Editor > Run. Re-runnable.

select publisher_correction('mcp_server', 'hadacart-public-catalog-snapshots',
         array['payments', 'invoicing', 'bookkeeping', 'procurement'],
         array['price-monitoring', 'web-research'],
         'https://hadacart.com/agents/', 'https://hadacart.com/agents/',
         'publisher request: shopping catalog search and price comparison, no payment tools');

-- check: use cases and tasks now shown on the page
select e.slug, e.name,
       (select string_agg(p.capability, ', ' order by p.capability) from v_provider_capabilities p
         where p.provider_slug = e.slug and p.provider_type = 'mcp_server') as use_cases,
       (select string_agg(t.task_name, ', ' order by t.task_name) from v_task_rankings t where t.provider_id = e.id) as tasks
  from entities e
 where e.type = 'mcp_server' and e.slug like 'hadacart%'
 order by e.slug;
