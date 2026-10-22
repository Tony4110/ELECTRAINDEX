-- =====================================================================
-- 0043 — Electra Index MCP server: usage log, rate limits, availability history
--  * mcp_usage: one row per tool call (tool, paid or not, hashed client).
--    Private. Used to see which tools agents really use.
--  * mcp_gate(): called by the server before each tool call. Limits per client
--    (hashed per day): 60 calls/minute, 2,000/day. Returns 'ok' or 'rate_limited'.
--  * mcp_live_history: every live check result is kept (the check log itself
--    is purged after 14 days). Private: this is the paid "availability history".
--  * mcp_server_history(slug, secret): the paid product, readable only by the
--    MCP server (shared secret in Vault 'mcp_api_secret' + Netlify MCP_API_SECRET).
-- =====================================================================

create table if not exists mcp_usage (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  tool   text not null,
  paid   boolean not null default false,
  client text
);
create index if not exists idx_mcp_usage_at on mcp_usage(at desc);
create index if not exists idx_mcp_usage_client on mcp_usage(client, at desc);
alter table mcp_usage enable row level security;   -- private

create or replace function mcp_gate(p_tool text, p_client text default null, p_paid boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_hash text := md5(coalesce(nullif(p_client, ''), 'unknown') || ':' || current_date::text || ':electra-mcp');
begin
  if (select count(*) from mcp_usage where client = v_hash and at > now() - interval '1 minute') >= 60
     or (select count(*) from mcp_usage where client = v_hash and at > now() - interval '1 day') >= 2000 then
    return 'rate_limited';
  end if;
  insert into mcp_usage(tool, paid, client) values (left(coalesce(p_tool, '?'), 60), coalesce(p_paid, false), v_hash);
  return 'ok';
end $$;
revoke execute on function mcp_gate(text, text, boolean) from public;
grant execute on function mcp_gate(text, text, boolean) to anon, authenticated;

-- availability history -------------------------------------------------
create table if not exists mcp_live_history (
  entity_id        uuid not null references entities(id) on delete cascade,
  checked_at       timestamptz not null,
  status           text not null,
  http             int,
  tool_count       int,
  protocol_version text,
  primary key (entity_id, checked_at)
);
alter table mcp_live_history enable row level security;   -- private (paid data)

create or replace function mcp_live_history_add() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into mcp_live_history(entity_id, checked_at, status, http, tool_count, protocol_version)
  values (new.entity_id, new.checked_at, new.status, new.http, new.tool_count, new.protocol_version)
  on conflict (entity_id, checked_at) do update
     set status = excluded.status, http = excluded.http,
         tool_count = coalesce(excluded.tool_count, mcp_live_history.tool_count),
         protocol_version = coalesce(excluded.protocol_version, mcp_live_history.protocol_version);
  return null;
end $$;
drop trigger if exists mcp_live_status_history on mcp_live_status;
create trigger mcp_live_status_history after insert or update of checked_at, status, tool_count on mcp_live_status
  for each row execute function mcp_live_history_add();
revoke execute on function mcp_live_history_add() from public, anon, authenticated;

-- backfill from the check log still available (last 14 days)
insert into mcp_live_history(entity_id, checked_at, status, http)
select c.entity_id, c.dispatched_at, c.result->>'status', nullif(c.result->>'http', '')::int
  from mcp_live_checks c
 where c.phase = 'init' and c.applied and coalesce(c.result->>'status', '') not in ('', 'lost')
on conflict do nothing;
insert into mcp_live_history(entity_id, checked_at, status, http, tool_count, protocol_version)
select entity_id, checked_at, status, http, tool_count, protocol_version from mcp_live_status
on conflict (entity_id, checked_at) do nothing;

-- the paid product ------------------------------------------------------
create or replace function mcp_server_history(p_slug text, p_secret text, p_days int default 90)
returns jsonb language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; v_name text; v_secret text; v_days int := least(greatest(coalesce(p_days, 90), 1), 365); r jsonb;
begin
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'mcp_api_secret' limit 1;
  exception when others then v_secret := null;
  end;
  if coalesce(v_secret, '') = '' or p_secret is distinct from v_secret then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id, name into v_id, v_name from entities where type = 'mcp_server' and slug = p_slug and is_published;
  if v_id is null then return null; end if;
  with h as (
    select checked_at, status, http, tool_count, protocol_version,
           lag(status) over (order by checked_at) as prev
      from mcp_live_history
     where entity_id = v_id and checked_at > now() - make_interval(days => v_days)
  )
  select jsonb_build_object(
    'slug', p_slug, 'name', v_name, 'days', v_days,
    'checks', (select count(*) from h),
    'answered', (select count(*) from h where status in ('online','auth_required')),
    'answer_rate', (select round(100.0 * count(*) filter (where status in ('online','auth_required')) / nullif(count(*), 0), 1) from h),
    'first_check', (select min(checked_at) from h),
    'last_check', (select max(checked_at) from h),
    'last_online', (select max(checked_at) from h where status = 'online'),
    'transitions', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'from', prev, 'to', status) order by checked_at), '[]')
                      from h where prev is not null and prev is distinct from status),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'status', status, 'http', http, 'tools', tool_count, 'protocol', protocol_version) order by checked_at desc), '[]')
                   from (select * from h order by checked_at desc limit 200) t),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('at', detected_at, 'from', old_value, 'to', new_value) order by detected_at desc), '[]')
                   from change_events where entity_id = v_id and event_type = 'new_version' and is_published
                    and detected_at > now() - make_interval(days => v_days)),
    'method', 'Each check opens an MCP session and lists tools; it never runs a tool. "Answered" = online or asked for credentials. Not a guarantee of security, quality or uptime.'
  ) into r;
  return r;
end $$;
revoke execute on function mcp_server_history(text, text, int) from public;
grant execute on function mcp_server_history(text, text, int) to anon, authenticated;   -- protected by the shared secret
