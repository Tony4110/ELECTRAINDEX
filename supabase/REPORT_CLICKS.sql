-- ELECTRA INDEX — REPORT_CLICKS : who sends visitors where (read-only)

-- last 30 days, most clicked agents and tools
select type, slug, name, sum(clicks) as clicks,
       sum(clicks) filter (where target = 'website') as website,
       sum(clicks) filter (where target = 'pricing') as pricing,
       sum(clicks) filter (where target = 'repository') as source_code
  from v_click_report where day >= current_date - 30
 group by type, slug, name order by clicks desc limit 50;

-- clicks per day
select day, sum(clicks) as clicks from v_click_report group by day order by day desc limit 30;
