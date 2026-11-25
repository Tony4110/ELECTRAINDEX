-- ELECTRA INDEX — REPORT_VERIFIED : Electra Verified at a glance. READ ONLY, changes nothing.
-- Paste in Supabase > SQL Editor > Run.
select * from (
  select 1 as n, 'summary' as section, status as item, count(*)::text as value, null::text as detail, null::timestamptz as at
    from verified_subs group by status
  union all
  select 2, 'pilot', 'places used / cap', (select count(*) from verified_subs where status in ('active','grace'))::text || ' / ' || cap, null, null
    from verified_settings
  union all
  select 3, 'servers', e.name, v.status,
         v.badge_url || coalesce(' · last found ' || to_char(v.last_found_at, 'DD Mon'), ''), v.created_at
    from verified_subs v join entities e on e.id = v.entity_id
   where v.status <> 'removed'
  union all
  select 4, 'last events', e.name, x.event, x.detail, x.at
    from (select * from verified_events order by at desc limit 20) x
    join verified_subs v on v.id = x.sub_id join entities e on e.id = v.entity_id
) r order by n, at desc nulls last, item;
