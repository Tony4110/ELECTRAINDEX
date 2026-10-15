-- ELECTRA INDEX — read-only figures for the monthly report "State of MCP".
-- Changes nothing. One table: section | label | value. Paste into SQL Editor > Run, send the result.
with t as (select * from v_mcp_servers),
pk as (select t.id, p->>'registry' as registry, p->>'transport' as transport from t, jsonb_array_elements((case when jsonb_typeof(t.package_list) = 'array' then t.package_list else '[]'::jsonb end)) p),
rm as (select t.id, r->>'type' as rtype, r->'headers' as headers from t, jsonb_array_elements((case when jsonb_typeof(t.remotes) = 'array' then t.remotes else '[]'::jsonb end)) r),
rows as (
  select 1 as o, 'size' as section, 'tools listed (active)' as label, count(*)::text as value from t where coalesce(registry_status,'active') = 'active'
  union all select 2, 'size', 'tools listed (all statuses)', count(*)::text from t
  union all select 3, 'size', 'new tools first seen in last 30 days', count(*)::text from t where first_seen_at > now() - interval '30 days'
  union all select 4, 'size', 'new tools first seen in last 7 days', count(*)::text from t where first_seen_at > now() - interval '7 days'
  union all select 5, 'size', 'tools updated (seen with change) last 30 days', count(distinct entity_id)::text from change_events ce join t on t.id = ce.entity_id where ce.detected_at > now() - interval '30 days' and ce.event_type in ('new_version','field_changed')
  union all select 6, 'size', 'new versions published last 30 days', count(*)::text from change_events ce join t on t.id = ce.entity_id where ce.detected_at > now() - interval '30 days' and ce.event_type = 'new_version'
  union all select 7, 'size', 'first tool seen (date)', min(first_seen_at)::date::text from t
  union all select 10, 'access', 'hosted only', count(*)::text from t where remote and not coalesce(local,false)
  union all select 11, 'access', 'local package only', count(*)::text from t where local and not coalesce(remote,false)
  union all select 12, 'access', 'both hosted and local', count(*)::text from t where remote and local
  union all select 13, 'access', 'neither declared', count(*)::text from t where not coalesce(remote,false) and not coalesce(local,false)
  union all select 14, 'access', 'public source code (repository)', count(*)::text from t where repository_url is not null
  union all select 15, 'access', 'with a website', count(*)::text from t where website is not null
  union all select 20, 'packages', 'registry: ' || coalesce(registry,'?'), count(distinct id)::text from pk group by registry
  union all select 30, 'transport', 'hosted endpoint type: ' || coalesce(rtype,'?'), count(distinct id)::text from rm group by rtype
  union all select 31, 'transport', 'package transport: ' || coalesce(transport,'?'), count(distinct id)::text from pk group by transport
  union all select 40, 'security', 'hosted endpoints requiring a header (API key/token)', count(distinct id)::text from rm, jsonb_array_elements((case when jsonb_typeof(headers) = 'array' then headers else '[]'::jsonb end)) h where (h->>'required')::boolean
  union all select 41, 'security', 'packages requiring a secret env variable', count(distinct t.id)::text from t, jsonb_array_elements((case when jsonb_typeof(t.package_list) = 'array' then t.package_list else '[]'::jsonb end)) p, jsonb_array_elements((case when jsonb_typeof(p->'env') = 'array' then p->'env' else '[]'::jsonb end)) e where (e->>'required')::boolean and (e->>'secret')::boolean
  union all select 50, 'use cases', capability, tools::text || ' tools · ' || hosted_tools || ' hosted · ' || agents || ' agents' from v_capability_overview where tools > 0
  union all select 60, 'payments', 'protocol mentioned: ' || protocol_slug, tools::text || ' tools · ' || agents || ' agents' from protocol_mentions
  union all select 61, 'payments', 'payment providers listed', count(*)::text from v_payment_providers
  union all select 70, 'publishers', 'top namespace: ' || ns, n::text from (
      select split_part(registry_name, '/', 1) as ns, count(*) as n from t where registry_name is not null group by 1 order by 2 desc limit 15) x
  union all select 80, 'agents', 'AI agents listed', count(*)::text from v_agent_cards
  union all select 81, 'agents', 'agents with public prices', count(*)::text from v_agent_cards where from_usd_month is not null
  union all select 82, 'agents', 'median starting price $/month', percentile_cont(0.5) within group (order by from_usd_month)::numeric(10,2)::text from v_agent_cards where from_usd_month is not null
  union all select 83, 'agents', 'agents with a free plan', count(*)::text from v_agent_cards where has_free
  union all select 90, 'prices', 'price changes detected last 30 days: ' || event_type, count(*)::text from change_events
      where detected_at > now() - interval '30 days' and event_type in ('price_increase','price_decrease','plan_added','plan_removed') group by event_type
  union all select 91, 'prices', 'pricing pages watched daily', count(*)::text from entities where coalesce(attributes->'pricing.url'->>'value','') ~* '^https?://' and is_published
)
select section, label, value from rows order by o, section, label;
