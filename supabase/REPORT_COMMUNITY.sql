-- ELECTRA INDEX — what visitors sent (read-only). Paste into SQL Editor > Run.
select 'report' as what, r.created_at::date as day, e.type, e.name, r.kind as detail, r.note, r.status, r.resolution
  from community_reports r join entities e on e.id = r.entity_id
 where r.created_at > now() - interval '30 days' and r.status <> 'spam'
union all
select 'listing request', s.created_at::date, s.kind, s.name, s.website, s.description, s.status,
       coalesce((select e.slug from entities e where e.id = s.entity_id), '')
  from submissions s
 where s.created_at > now() - interval '60 days'
order by day desc, what;
