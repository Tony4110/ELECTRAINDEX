-- ELECTRA INDEX — INSTALL_ELECTRA_SNAPSHOT_V3 : adds Monitoring subscriptions to the public totals
create or replace function refresh_electra_snapshot() returns void
language plpgsql security definer set search_path = public as $$
declare p jsonb;
begin
  select jsonb_build_object(
    'mcp_total',     count(*) filter (where type = 'mcp_server'),
    'mcp_new_7d',    count(*) filter (where type = 'mcp_server' and created_at > now() - interval '7 days'),
    'agents_total',  count(*) filter (where type = 'agent'),
    'agents_new_7d', count(*) filter (where type = 'agent' and created_at > now() - interval '7 days'),
    'apps_total',    count(*) filter (where type = 'app'),
    'apps_new_7d',   count(*) filter (where type = 'app' and created_at > now() - interval '7 days'))
    into p
    from entities where status = 'active' and type in ('mcp_server', 'agent', 'app');
  p := p || jsonb_build_object(
    'listing_requests_pending', (select count(*) from submissions where status = 'new'),
    'outreach_sent_7d',  (select count(*) from notify_log where kind = 'outreach_new_mcp' and skipped is null and created_at > now() - interval '7 days'),
    'monitoring_active', (select count(*) from monitor_subs where status = 'active'),
    'monitoring_new_7d', (select count(*) from monitor_subs where status = 'active' and created_at > now() - interval '7 days'),
    'as_of', now());
  insert into electra_snapshot_cache(id, payload, refreshed_at) values (1, p, now())
  on conflict (id) do update set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
end $$;
revoke execute on function refresh_electra_snapshot() from public, anon, authenticated;

select refresh_electra_snapshot();
select electra_snapshot();
