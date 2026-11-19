-- ELECTRA INDEX — REPORT_CLICKS_HUMAN : real people vs robots in the outbound clicks. READ ONLY, changes nothing.
-- "human" = from one of our pages, a real browser, first click of that visitor on that product today, max 20 a day.
-- Paste in Supabase > SQL Editor > Run (the three tables appear one after the other: use the result tabs).

-- 1. per day: all logged clicks, human clicks, distinct human visitors (last 30 days)
select created_at::date as day, count(*) as all_logged, count(*) filter (where human) as human_clicks,
       count(distinct visitor) filter (where human) as human_visitors
  from outbound_clicks where created_at > now() - interval '30 days'
 group by 1 order by 1 desc;

-- 2. what real people click (last 30 days, top 30)
select e.type, e.name, c.target, count(*) as human_clicks, count(distinct c.visitor) as visitors
  from outbound_clicks c join entities e on e.id = c.entity_id
 where c.human and c.created_at > now() - interval '30 days'
 group by 1, 2, 3 order by human_clicks desc limit 30;

-- 3. from which of our pages (last 30 days, top 20)
select regexp_replace(coalesce(page_path, '(none)'), '\?.*$', '') as from_page, count(*) as human_clicks
  from outbound_clicks where human and created_at > now() - interval '30 days'
 group by 1 order by 2 desc limit 20;
