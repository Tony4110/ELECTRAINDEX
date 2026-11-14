-- ELECTRA INDEX — INSTALL_ELECTRA_SNAPSHOT : public totals for the Cockpit (counts only, no names, no lists)
create or replace function electra_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mcp_total',      (select count(*) from entities where type = 'mcp_server' and status = 'active'),
    'mcp_new_7d',     (select count(*) from entities where type = 'mcp_server' and status = 'active' and created_at > now() - interval '7 days'),
    'agents_total',   (select count(*) from entities where type = 'agent' and status = 'active'),
    'agents_new_7d',  (select count(*) from entities where type = 'agent' and status = 'active' and created_at > now() - interval '7 days'),
    'apps_total',     (select count(*) from entities where type = 'app' and status = 'active'),
    'apps_new_7d',    (select count(*) from entities where type = 'app' and status = 'active' and created_at > now() - interval '7 days'),
    'listing_requests_pending', (select count(*) from submissions where status = 'new'),
    'outreach_sent_7d', (select count(*) from notify_log where kind = 'outreach_new_mcp' and skipped is null and created_at > now() - interval '7 days'),
    'as_of', now()
  )
$$;
revoke execute on function electra_snapshot() from public;
grant execute on function electra_snapshot() to anon, authenticated;

select electra_snapshot();
