-- ELECTRA INDEX — affiliate status (private). Paste into SQL Editor > Run.
select p.vendor, p.status, p.commission, p.network, p.program_url,
       (l.url is not null and l.active) as link_live,
       (select count(*) from outbound_clicks c where c.entity_id = p.entity_id and c.target = 'affiliate') as affiliate_clicks
  from affiliate_programs p left join affiliate_links l on l.entity_id = p.entity_id
 where p.status <> 'skip'
 order by (p.status = 'approved') desc, p.commission_percent desc nulls last, p.vendor;
