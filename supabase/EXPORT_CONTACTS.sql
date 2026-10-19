-- ELECTRA INDEX — EXPORT_CONTACTS (read-only). Paste into SQL Editor > Run, then "Export" > "Download CSV".
-- can_send_offers = true only for people who ticked the offers box. The others may only be
-- contacted about their own listing / the page they follow (that is what the forms promised).
select 'listing request'                       as source,
       s.created_at::date                      as since,
       s.contact_email                         as email,
       s.name                                  as product,
       s.kind,
       s.website,
       s.status,
       coalesce('https://electraindex.com/' || case e.type when 'agent' then 'agents/' else 'mcp/' end || e.slug, '') as page,
       'publisher'                             as role,
       s.offers_opt_in                         as can_send_offers
  from submissions s left join entities e on e.id = s.entity_id
 where s.status <> 'rejected' or s.offers_opt_in
union all
select 'follow',
       f.created_at::date,
       f.email,
       e.name,
       e.type,
       coalesce(e.website, ''),
       case when f.unsubscribed_at is null then 'subscribed' else 'unsubscribed' end,
       'https://electraindex.com/' || case e.type when 'agent' then 'agents/' else 'mcp/' end || e.slug,
       f.role,
       f.offers_opt_in and f.unsubscribed_at is null
  from page_followers f join entities e on e.id = f.entity_id
order by can_send_offers desc, since desc;
