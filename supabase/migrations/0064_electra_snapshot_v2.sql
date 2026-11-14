-- ELECTRA INDEX — INSTALL_ELECTRA_SNAPSHOT_V2 : the public API reads a cache refreshed every hour
--  (the public key has a 3-second limit; counting 57,000 records live was too slow). Counts only, no names.
create table if not exists electra_snapshot_cache (id int primary key default 1 check (id = 1), payload jsonb not null, refreshed_at timestamptz not null default now());
alter table electra_snapshot_cache enable row level security;   -- read only through electra_snapshot()

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
    'outreach_sent_7d', (select count(*) from notify_log where kind = 'outreach_new_mcp' and skipped is null and created_at > now() - interval '7 days'),
    'as_of', now());
  insert into electra_snapshot_cache(id, payload, refreshed_at) values (1, p, now())
  on conflict (id) do update set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
end $$;
revoke execute on function refresh_electra_snapshot() from public, anon, authenticated;

create or replace function electra_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select payload from electra_snapshot_cache where id = 1
$$;
revoke execute on function electra_snapshot() from public;
grant execute on function electra_snapshot() to anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname = 'electra-snapshot';
select cron.schedule('electra-snapshot', '5 * * * *', $job$ select refresh_electra_snapshot(); $job$);

select refresh_electra_snapshot();
select electra_snapshot();
