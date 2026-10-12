-- ELECTRA INDEX — REPORT_PRICEWATCH : what the price watch robot found (read-only)

-- 1) summary of the latest check of each pricing page
select status, count(*) from v_price_watch group by status order by 2 desc;

-- 2) what needs a human look (changed prices, missing prices, dead pages)
select e.type, e.name, q.reason, q.payload->>'url' as url,
       coalesce(q.payload->'missing_on_page', q.payload->'added') as detail, q.payload->'removed' as removed, q.created_at::date as since
  from review_queue q join entities e on e.id = q.entity_id
 where q.status = 'open' and q.reason in ('pricing_page_changed','price_mismatch','pricing_page_gone')
 order by q.created_at desc;
