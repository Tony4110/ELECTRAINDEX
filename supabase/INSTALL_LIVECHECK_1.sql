-- ELECTRA INDEX — INSTALL_LIVECHECK_1 : live check robot for hosted MCP servers (first test batch of 50)
-- The robot connects like an AI assistant, asks for the tool list, never runs a tool, never sends a key.
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable. Then wait 10 minutes and run REPORT_LIVECHECK.sql.

-- =====================================================================
-- 0034 — Robot "live check" for hosted MCP servers (100% SQL, pg_net)
--  For each hosted endpoint declared in the Official MCP Registry, the
--  robot connects like an AI assistant would and asks two questions:
--     1. initialize   -> does the server answer? which protocol version, which name/version?
--     2. tools/list   -> which tools does it offer (names + descriptions)?
--  It NEVER calls a tool (no side effects), never sends any key or token,
--  and identifies itself as ElectraIndexBot.
--
--  Results (public, one row per server):
--     online          answered initialize (tools listed when the server allows it)
--     auth_required   reachable, but asks for a key or a sign-in (HTTP 401/403)
--     not_found       nothing at that address (404/405/410)
--     not_mcp         answered, but not with an MCP response
--     error           server error / rate limit (5xx, 429) or JSON-RPC error
--     timeout         no answer within 15 s
--     unreachable     DNS / TLS / connection failure
--  A server is shown as "not responding" only after 2 failed checks in a row.
--
--  Politeness: https only, no IP literals or private hosts, at most
--  p_per_host servers of the same host per batch, each server re-checked
--  at most once per p_stale.
--
--  Phases (pg_net is asynchronous):
--     select live_check_dispatch(50);   -- sends "initialize"
--     select live_check_apply();        -- every 2 min (cron): reads answers,
--                                       --   sends "initialized" then "tools/list"
-- =====================================================================

create extension if not exists pg_net;

create table if not exists mcp_live_checks (
  request_id    bigint primary key,
  entity_id     uuid not null references entities(id) on delete cascade,
  url           text not null,
  phase         text not null check (phase in ('init','notify','list')),
  session_id    text,
  protocol      text,
  dispatched_at timestamptz not null default now(),
  applied       boolean not null default false,
  result        jsonb
);
create index if not exists idx_mcp_live_checks_pending on mcp_live_checks(applied, dispatched_at);
create index if not exists idx_mcp_live_checks_entity on mcp_live_checks(entity_id, dispatched_at desc);
alter table mcp_live_checks enable row level security;   -- private

create table if not exists mcp_live_status (
  entity_id            uuid primary key references entities(id) on delete cascade,
  url                  text not null,
  status               text not null,
  http                 int,
  detail               text,
  protocol_version     text,
  server_name          text,
  server_version       text,
  tool_count           int,
  tools_more           boolean not null default false,
  tools                jsonb,                       -- [{name, description}] (first page, max 100)
  checked_at           timestamptz not null default now(),
  last_online_at       timestamptz,
  consecutive_failures int not null default 0,
  status_changed_at    timestamptz not null default now()
);
create index if not exists idx_mcp_live_status_status on mcp_live_status(status);
alter table mcp_live_status enable row level security;   -- read through the public view only

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function try_jsonb(p text) returns jsonb language plpgsql immutable as $$
begin
  return p::jsonb;
exception when others then
  return null;
end $$;

-- the JSON-RPC answer in a body that is either plain JSON or a text/event-stream
create or replace function mcp_rpc_answer(p_content text) returns jsonb language sql immutable as $$
  select coalesce(
    (select j from (select try_jsonb(btrim(p_content)) j) x
      where jsonb_typeof(j) = 'object' and (j ? 'result' or j ? 'error')),
    (select j from (select try_jsonb(btrim(m[1])) j, ord
                      from regexp_matches(coalesce(p_content, ''), '^data:[ ]?(.*)$', 'gn') with ordinality as t(m, ord)) x
      where jsonb_typeof(j) = 'object' and (j ? 'result' or j ? 'error')
      order by ord limit 1))
$$;

create or replace function header_value(p_headers jsonb, p_name text) returns text language sql immutable as $$
  select value from jsonb_each_text(case when jsonb_typeof(p_headers) = 'object' then p_headers else '{}'::jsonb end)
   where lower(key) = lower(p_name) limit 1
$$;

-- only public https hosts (no IP literals, no local/private names, no URL templates)
create or replace function live_check_url_ok(p_url text) returns boolean language sql immutable as $$
  select coalesce(p_url, '') ~* '^https://[a-z0-9.-]+\.[a-z]{2,}(:[0-9]+)?(/[^\s{}]*)?$'
     and host_of(p_url) !~* '(^localhost$|\.local$|\.internal$|\.localhost$|^[0-9.]+$)'
$$;

create or replace function live_check_ua() returns jsonb language sql immutable as $$
  select jsonb_build_object('User-Agent', 'ElectraIndexBot/1.0 (+https://electraindex.com/sources#live-check)',
                            'Content-Type', 'application/json',
                            'Accept', 'application/json, text/event-stream')
$$;

-- ---------------------------------------------------------------------
-- dispatch: "initialize" to a batch of hosted servers
-- ---------------------------------------------------------------------
create or replace function live_check_dispatch(p_batch int default 300, p_stale interval default interval '3 days',
                                               p_per_host int default 3)
returns int language plpgsql security definer set search_path = public, net as $$
declare rec record; rid bigint; n int := 0;
begin
  for rec in
    with cand as (
      select e.id, r.url, s.checked_at
        from entities e
        cross join lateral (
          select x->>'url' as url
            from jsonb_array_elements(case when jsonb_typeof(e.attributes->'mcp.remotes'->'value') = 'array'
                                           then e.attributes->'mcp.remotes'->'value' else '[]'::jsonb end) x
           where coalesce(x->>'type', 'streamable-http') <> 'sse' and live_check_url_ok(x->>'url')
           order by x->>'url' limit 1) r
        left join mcp_live_status s on s.entity_id = e.id
       where e.type = 'mcp_server' and e.is_published
         and (s.checked_at is null or s.checked_at < now() - p_stale)
         and not exists (select 1 from mcp_live_checks c where c.entity_id = e.id and c.dispatched_at > now() - interval '1 hour')
    ), ranked as (
      select cand.*, row_number() over (partition by host_of(url) order by checked_at nulls first, id) as rn from cand
    )
    select id, url from ranked where rn <= p_per_host
     order by checked_at nulls first, rn, id
     limit p_batch
  loop
    select net.http_post(url := rec.url,
                         body := jsonb_build_object('jsonrpc', '2.0', 'id', 1, 'method', 'initialize',
                                   'params', jsonb_build_object('protocolVersion', '2025-06-18', 'capabilities', '{}'::jsonb,
                                             'clientInfo', jsonb_build_object('name', 'ElectraIndexBot', 'version', '1.0'))),
                         headers := live_check_ua(),
                         timeout_milliseconds := 15000) into rid;
    insert into mcp_live_checks(request_id, entity_id, url, phase) values (rid, rec.id, rec.url, 'init') on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- write the public status row (failures are only shown after 2 in a row)
create or replace function live_check_set(p_entity uuid, p_url text, p_status text, p_http int, p_detail text,
                                          p_info jsonb default null) returns void language plpgsql as $$
declare v_online boolean := p_status = 'online';
begin
  insert into mcp_live_status as s (entity_id, url, status, http, detail, protocol_version, server_name, server_version,
                                    checked_at, last_online_at, consecutive_failures, status_changed_at)
  values (p_entity, p_url, p_status, p_http, left(p_detail, 300), p_info->>'protocol', left(p_info->>'name', 200), left(p_info->>'version', 60),
          now(), case when v_online then now() end, case when v_online or p_status = 'auth_required' then 0 else 1 end, now())
  on conflict (entity_id) do update set
    url = excluded.url, status = excluded.status, http = excluded.http, detail = excluded.detail,
    protocol_version = coalesce(excluded.protocol_version, case when v_online then null else s.protocol_version end),
    server_name = coalesce(excluded.server_name, case when v_online then null else s.server_name end),
    server_version = coalesce(excluded.server_version, case when v_online then null else s.server_version end),
    checked_at = now(),
    last_online_at = case when v_online then now() else s.last_online_at end,
    consecutive_failures = case when v_online or p_status = 'auth_required' then 0 else s.consecutive_failures + 1 end,
    status_changed_at = case when s.status is distinct from excluded.status then now() else s.status_changed_at end;
end $$;

-- ---------------------------------------------------------------------
-- apply: read answers, move each server to its next phase
-- ---------------------------------------------------------------------
create or replace function live_check_apply() returns jsonb language plpgsql security definer set search_path = public, net as $$
declare
  rec record; ans jsonb; v_status text; v_detail text; v_sid text; v_proto text; rid bigint; v_hdr jsonb;
  n_init int := 0; n_list int := 0; n_fail int := 0; n_lost int := 0;
begin
  for rec in
    select c.*, r.status_code, r.headers as rheaders, r.content, r.timed_out, r.error_msg
      from mcp_live_checks c
      join net._http_response r on r.id = c.request_id
     where not c.applied
     order by c.dispatched_at
  loop
    ans := case when rec.status_code between 200 and 299 then mcp_rpc_answer(rec.content) end;

    if rec.phase = 'init' then
      v_detail := null; v_sid := null;
      if coalesce(rec.timed_out, false) then v_status := 'timeout';
      elsif rec.status_code is null then v_status := 'unreachable'; v_detail := rec.error_msg;
      elsif rec.status_code in (401, 403) then v_status := 'auth_required';
        v_detail := case when header_value(rec.rheaders, 'www-authenticate') ilike 'bearer%' then 'sign-in (OAuth or token)' end;
      elsif rec.status_code in (404, 405, 410) then v_status := 'not_found';
      elsif rec.status_code = 429 or rec.status_code >= 500 then v_status := 'error';
      elsif rec.status_code between 200 and 299 and ans ? 'result' and jsonb_typeof(ans->'result') = 'object'
            and (ans->'result' ? 'protocolVersion' or ans->'result' ? 'serverInfo') then v_status := 'online';
      elsif ans ? 'error' then
        v_status := case when (ans->'error'->>'message') ~* 'auth|token|api.?key|unauthori|forbidden|credential' then 'auth_required' else 'error' end;
        v_detail := ans->'error'->>'message';
      else v_status := 'not_mcp';
      end if;

      perform live_check_set(rec.entity_id, rec.url, v_status, rec.status_code, v_detail,
        case when v_status = 'online' then jsonb_build_object(
               'protocol', ans->'result'->>'protocolVersion',
               'name', ans->'result'->'serverInfo'->>'name',
               'version', ans->'result'->'serverInfo'->>'version') end);

      if v_status = 'online' then
        n_init := n_init + 1;
        v_sid := header_value(rec.rheaders, 'mcp-session-id');
        v_proto := coalesce(ans->'result'->>'protocolVersion', '2025-06-18');
        v_hdr := live_check_ua() || jsonb_build_object('MCP-Protocol-Version', v_proto)
                 || case when v_sid is not null then jsonb_build_object('Mcp-Session-Id', v_sid) else '{}'::jsonb end;
        select net.http_post(url := rec.url, body := '{"jsonrpc":"2.0","method":"notifications/initialized"}'::jsonb,
                             headers := v_hdr, timeout_milliseconds := 15000) into rid;
        insert into mcp_live_checks(request_id, entity_id, url, phase, session_id, protocol)
        values (rid, rec.entity_id, rec.url, 'notify', v_sid, v_proto) on conflict do nothing;
      else
        n_fail := n_fail + 1;
      end if;
      update mcp_live_checks set applied = true, session_id = v_sid,
             result = jsonb_build_object('status', v_status, 'http', rec.status_code)
       where request_id = rec.request_id;

    elsif rec.phase = 'notify' then
      -- whatever the answer (usually 202), ask for the tool list next
      v_hdr := live_check_ua() || jsonb_build_object('MCP-Protocol-Version', coalesce(rec.protocol, '2025-06-18'))
               || case when rec.session_id is not null then jsonb_build_object('Mcp-Session-Id', rec.session_id) else '{}'::jsonb end;
      select net.http_post(url := rec.url, body := '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'::jsonb,
                           headers := v_hdr, timeout_milliseconds := 15000) into rid;
      insert into mcp_live_checks(request_id, entity_id, url, phase, session_id, protocol)
      values (rid, rec.entity_id, rec.url, 'list', rec.session_id, rec.protocol) on conflict do nothing;
      update mcp_live_checks set applied = true, result = jsonb_build_object('http', rec.status_code) where request_id = rec.request_id;

    else -- list
      if jsonb_typeof(ans->'result'->'tools') = 'array' then
        update mcp_live_status set
          tool_count = jsonb_array_length(ans->'result'->'tools'),
          tools_more = coalesce(ans->'result'->>'nextCursor', '') <> '',
          tools = (select coalesce(jsonb_agg(jsonb_build_object('name', left(t->>'name', 120),
                                                                 'description', nullif(left(regexp_replace(coalesce(t->>'description', ''), '\s+', ' ', 'g'), 240), '')) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(ans->'result'->'tools') with ordinality as x(t, ord)
                    where ord <= 100 and coalesce(t->>'name', '') <> '')
         where entity_id = rec.entity_id;
        n_list := n_list + 1;
      else
        -- online, but tools not listed to anonymous clients: keep the last known list
        update mcp_live_status set detail = coalesce(detail, 'tools not listed without a session') where entity_id = rec.entity_id;
      end if;
      update mcp_live_checks set applied = true,
             result = jsonb_build_object('http', rec.status_code, 'tools', jsonb_array_length(case when jsonb_typeof(ans->'result'->'tools') = 'array' then ans->'result'->'tools' else '[]'::jsonb end))
       where request_id = rec.request_id;
    end if;
  end loop;

  -- requests whose answer never arrived (pg_net drops responses after a few hours)
  with lost as (
    update mcp_live_checks c set applied = true, result = '{"status":"lost"}'
     where not c.applied and c.dispatched_at < now() - interval '2 hours'
       and not exists (select 1 from net._http_response r where r.id = c.request_id)
    returning 1)
  select count(*) into n_lost from lost;

  delete from mcp_live_checks where applied and dispatched_at < now() - interval '14 days';   -- keep the log small

  return jsonb_build_object('online', n_init, 'tools_listed', n_list, 'not_online', n_fail, 'lost', n_lost);
end $$;

revoke execute on function live_check_dispatch(int, interval, int) from public, anon, authenticated;
revoke execute on function live_check_apply() from public, anon, authenticated;
revoke execute on function live_check_set(uuid, text, text, int, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- public view (tool pages)
-- ---------------------------------------------------------------------
create or replace view v_mcp_live as
select e.slug,
       case when s.status in ('online','auth_required') then s.status
            when s.consecutive_failures >= 2 then 'down'
            else 'unconfirmed' end              as status,
       s.status                                 as last_result,
       s.http, s.protocol_version, s.server_name, s.server_version,
       s.tool_count, s.tools_more, s.tools,
       s.checked_at, s.last_online_at, s.status_changed_at, s.url
  from mcp_live_status s
  join entities e on e.id = s.entity_id
 where e.is_published;
grant select on v_mcp_live to anon, authenticated;

-- private report for the SQL Editor
create or replace view v_live_check_report as
select s.status, count(*) as servers,
       count(*) filter (where s.tool_count > 0) as with_tools,
       round(avg(s.tool_count) filter (where s.tool_count > 0), 1) as avg_tools,
       max(s.checked_at) as last_check
  from mcp_live_status s group by s.status order by servers desc;

-- 0035 — live check: read answers every 2 minutes (harmless when nothing is pending)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-apply';
select cron.schedule('electra-live-check-apply', '*/2 * * * *', $job$ select live_check_apply(); $job$);

-- first test batch: 50 servers (the automatic schedule is switched on later with INSTALL_LIVECHECK_2)
select 'live check ready' as status, live_check_dispatch(50) as first_batch_sent,
       (select count(*) from cron.job where jobname like 'electra-live-check-%') as cron_jobs;
