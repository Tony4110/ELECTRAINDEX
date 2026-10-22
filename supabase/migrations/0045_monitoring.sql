-- =====================================================================
-- 0045 — Monitoring Pro (USD 9.99/month, Stripe subscription)
--  For the publisher of a hosted MCP server:
--   * its endpoint is checked every 30 minutes (instead of every few days),
--     with the same polite robot as the public live check (0034);
--   * an email as soon as it stops answering (2 failed checks in a row,
--     so within about an hour) and when it is back online;
--   * a private report page (link with a secret token): answer rate,
--     outages, every check of the last 90 days;
--   * an embeddable status badge showing the 30-day answer rate.
--  Subscriptions are created and ended by the Stripe webhook only
--  (protected by the Vault secret 'mcp_api_secret', see 0043/0044).
--  A server that only runs locally cannot be monitored: the subscription
--  is then "pending", contact@ is told, and we refund.
-- =====================================================================

create table if not exists monitor_subs (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  email               text not null,
  server_ref          text,                         -- what the buyer gave us (slug, page URL, endpoint URL or name)
  entity_id           uuid references entities(id) on delete set null,
  status              text not null default 'pending' check (status in ('active','pending','canceled')),
  stripe_session      text unique,
  stripe_subscription text unique,
  stripe_customer     text,
  token               uuid not null unique default gen_random_uuid(),   -- private report link
  alerted_status      text,                         -- 'up' | 'down': last state we emailed about
  last_alert_at       timestamptz,
  canceled_at         timestamptz
);
create index if not exists idx_monitor_subs_active on monitor_subs(status, entity_id);
alter table monitor_subs enable row level security;   -- private

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
-- the hosted endpoint the robot checks for a server (same rule as live_check_dispatch)
create or replace function live_check_url(p_entity uuid) returns text language sql stable as $$
  select x->>'url'
    from entities e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e.attributes->'mcp.remotes'->'value') = 'array'
                                                 then e.attributes->'mcp.remotes'->'value' else '[]'::jsonb end) x
   where e.id = p_entity and coalesce(x->>'type', 'streamable-http') <> 'sse' and live_check_url_ok(x->>'url')
   order by x->>'url' limit 1
$$;

-- find the MCP server a buyer meant: slug, Electra Index page URL, endpoint URL or exact name
create or replace function monitor_resolve(p_ref text) returns uuid language plpgsql stable set search_path = public as $$
declare v text := lower(btrim(coalesce(p_ref, ''))); v_slug text; v_id uuid;
begin
  if v = '' then return null; end if;
  v_slug := coalesce(substring(v from '/mcp/([a-z0-9-]+)'), v);
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = v_slug;
  if v_id is not null then return v_id; end if;
  if v ~ '^https?://' then
    select e.id into v_id
      from entities e
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.attributes->'mcp.remotes'->'value') = 'array'
                                                   then e.attributes->'mcp.remotes'->'value' else '[]'::jsonb end) x
     where e.type = 'mcp_server' and e.is_published and rtrim(lower(x->>'url'), '/') = rtrim(v, '/')
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  select id into v_id from entities where type = 'mcp_server' and is_published and lower(name) = v
   order by last_seen_at desc nulls last limit 1;
  return v_id;
end $$;

-- the availability data (shared by the paid MCP tool and the private report)
create or replace function server_history_data(p_entity uuid, p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(coalesce(p_days, 90), 1), 365); r jsonb; v_slug text; v_name text;
begin
  select slug, name into v_slug, v_name from entities where id = p_entity;
  if v_slug is null then return null; end if;
  with h as (
    select checked_at, status, http, tool_count, protocol_version,
           lag(status) over (order by checked_at) as prev
      from mcp_live_history
     where entity_id = p_entity and checked_at > now() - make_interval(days => v_days)
  )
  select jsonb_build_object(
    'slug', v_slug, 'name', v_name, 'days', v_days,
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
                   from change_events where entity_id = p_entity and event_type = 'new_version' and is_published
                    and detected_at > now() - make_interval(days => v_days)),
    'method', 'Each check opens an MCP session and lists tools; it never runs a tool. "Answered" = online or asked for credentials. Not a guarantee of security, quality or uptime.'
  ) into r;
  return r;
end $$;
revoke execute on function server_history_data(uuid, int) from public, anon, authenticated;

-- the paid MCP tool keeps the same contract, now built on the shared function
create or replace function mcp_server_history(p_slug text, p_secret text, p_days int default 90)
returns jsonb language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into v_id from entities where type = 'mcp_server' and slug = p_slug and is_published;
  if v_id is null then return null; end if;
  return server_history_data(v_id, p_days);
end $$;
revoke execute on function mcp_server_history(text, text, int) from public;
grant execute on function mcp_server_history(text, text, int) to anon, authenticated;   -- protected by the shared secret

create or replace function monitor_signature() returns text language sql immutable as $$
  select chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com'
$$;

-- ---------------------------------------------------------------------
-- subscription start / end (Stripe webhook only)
-- ---------------------------------------------------------------------
create or replace function monitor_subscribe(p_secret text, p_email text, p_ref text, p_subscription text,
                                             p_customer text default null, p_session text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid; v_url text; v_slug text; v_name text; s monitor_subs;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'invalid email'; end if;
  if exists (select 1 from monitor_subs where (p_session is not null and stripe_session = p_session)
                                           or (p_subscription is not null and stripe_subscription = p_subscription)) then
    return 'exists';
  end if;

  v_id := monitor_resolve(p_ref);
  v_url := case when v_id is not null then live_check_url(v_id) end;
  select slug, name into v_slug, v_name from entities where id = v_id;

  insert into monitor_subs(email, server_ref, entity_id, status, stripe_session, stripe_subscription, stripe_customer)
  values (v_email, left(p_ref, 300), v_id, case when v_url is not null then 'active' else 'pending' end,
          p_session, p_subscription, p_customer)
  returning * into s;

  if s.status = 'active' then
    perform send_email('monitor_welcome', v_email, 'Monitoring Pro is on for ' || v_name,
      'Hi,' || chr(10) || chr(10) ||
      'Thank you for subscribing to Electra Index Monitoring Pro. From now on:' || chr(10) ||
      '- we connect to ' || v_url || ' every 30 minutes, as an AI assistant would (we never run a tool, never send a key);' || chr(10) ||
      '- you get an email if it stops answering (2 failed checks in a row, so within about an hour), and when it is back;' || chr(10) ||
      '- your private report (keep this link to yourself):' || chr(10) ||
      '  https://electraindex.com/monitor/r/' || s.token || chr(10) || chr(10) ||
      'YOUR STATUS BADGE (paste it in your README or website):' || chr(10) ||
      '[![Electra Index status](https://electraindex.com/api/badge/' || v_slug || ')](https://electraindex.com/mcp/' || v_slug || ')' || chr(10) || chr(10) ||
      'Or in HTML:' || chr(10) ||
      '<a href="https://electraindex.com/mcp/' || v_slug || '"><img src="https://electraindex.com/api/badge/' || v_slug || '" alt="Electra Index status"></a>' || chr(10) || chr(10) ||
      'The first check runs within 30 minutes. Monitoring never changes your rank on Electra Index.' || chr(10) ||
      'Cancel anytime: reply to this email.' || chr(10) || monitor_signature(), 200);
    perform notify_email('monitor_sold', 'Monitoring Pro started: ' || v_name,
      'New Monitoring Pro subscription for ' || v_name || ' (' || v_url || '), customer ' || v_email || ', subscription ' || coalesce(p_subscription, '-') || '.');
  else
    perform send_email('monitor_welcome', v_email, 'Monitoring Pro: which server should we monitor?',
      'Hi,' || chr(10) || chr(10) ||
      'Thank you for subscribing to Electra Index Monitoring Pro.' || chr(10) ||
      case when v_id is null then 'We could not match "' || coalesce(nullif(btrim(p_ref), ''), '(nothing given)') || '" to an MCP server in our index.'
           else v_name || ' has no hosted endpoint that we can check (it seems to run only on the user''s computer).' end || chr(10) || chr(10) ||
      'Please reply with the address of your hosted MCP endpoint (https://…) or the link to its Electra Index page, and we switch the monitoring on within one business day.' || chr(10) ||
      'If your server only runs locally, we refund you in full.' || chr(10) || monitor_signature(), 200);
    perform notify_email('monitor_pending', 'ACTION: Monitoring Pro to set up by hand',
      'Monitoring Pro paid by ' || v_email || ' but the server could not be matched or has no hosted endpoint.' || chr(10) ||
      'Given: ' || coalesce(p_ref, '(nothing)') || chr(10) || 'Subscription: ' || coalesce(p_subscription, '-') || chr(10) ||
      'Fix: update monitor_subs set entity_id = (select id from entities where slug = ''<slug>''), status = ''active'' where stripe_subscription = ''' || coalesce(p_subscription, '') || ''';' || chr(10) ||
      'Or refund it in Stripe.');
  end if;
  return s.status;
end $$;
revoke execute on function monitor_subscribe(text, text, text, text, text, text) from public;
grant execute on function monitor_subscribe(text, text, text, text, text, text) to anon, authenticated;   -- protected by the secret

create or replace function monitor_cancel(p_secret text, p_subscription text) returns text
language plpgsql security definer set search_path = public as $$
declare s monitor_subs; v_name text;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  update monitor_subs set status = 'canceled', canceled_at = now()
   where stripe_subscription = p_subscription and status <> 'canceled'
  returning * into s;
  if not found then return 'none'; end if;
  select name into v_name from entities where id = s.entity_id;
  perform send_email('monitor_welcome', s.email, 'Monitoring Pro has ended' || coalesce(' for ' || v_name, ''),
    'Hi,' || chr(10) || chr(10) || 'Your Electra Index Monitoring Pro subscription has ended. No further payment will be taken.' || chr(10) ||
    'Your server stays listed and keeps its public live check (every few days). Thank you for your trust.' || chr(10) || monitor_signature(), 200);
  perform notify_email('monitor_canceled', 'Monitoring Pro ended: ' || coalesce(v_name, s.server_ref, '?'),
    'Subscription ' || p_subscription || ' (' || s.email || ') has ended.');
  return 'canceled';
end $$;
revoke execute on function monitor_cancel(text, text) from public;
grant execute on function monitor_cancel(text, text) to anon, authenticated;   -- protected by the secret

-- ---------------------------------------------------------------------
-- robot: every 30 minutes for subscribers (cron, see INSTALL_MONITOR_1)
-- ---------------------------------------------------------------------
create or replace function monitor_dispatch() returns int language plpgsql security definer set search_path = public, net as $$
declare rec record; rid bigint; n int := 0;
begin
  for rec in
    select distinct m.entity_id as id, live_check_url(m.entity_id) as url
      from monitor_subs m
     where m.status = 'active' and m.entity_id is not null
       and not exists (select 1 from mcp_live_checks c where c.entity_id = m.entity_id and c.dispatched_at > now() - interval '25 minutes')
  loop
    continue when rec.url is null;
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
revoke execute on function monitor_dispatch() from public, anon, authenticated;

-- outage / recovery emails to subscribers
create or replace function monitor_alerts() returns jsonb language plpgsql security definer set search_path = public as $$
declare rec record; n_down int := 0; n_up int := 0; v_now text;
begin
  for rec in
    select m.id, m.email, m.token, m.alerted_status, e.name, e.slug, s.url, s.status, s.last_online_at, s.checked_at, s.status_changed_at,
           case when s.status in ('online','auth_required') then 'up'
                when s.consecutive_failures >= 2 then 'down' end as now_status
      from monitor_subs m
      join entities e on e.id = m.entity_id
      join mcp_live_status s on s.entity_id = m.entity_id
     where m.status = 'active'
  loop
    v_now := rec.now_status;
    continue when v_now is null or v_now = rec.alerted_status;
    if rec.alerted_status is null then
      update monitor_subs set alerted_status = v_now where id = rec.id;   -- first known state: nothing to report
      continue;
    end if;
    if v_now = 'down' then
      perform send_email('monitor_alert', rec.email, 'DOWN: ' || rec.name || ' is not answering',
        'Hi,' || chr(10) || chr(10) ||
        rec.name || ' did not answer our last 2 checks in a row (' || rec.status || ').' || chr(10) ||
        'Endpoint: ' || rec.url || chr(10) ||
        'Last check: ' || to_char(rec.checked_at at time zone 'utc', 'DD Mon YYYY HH24:MI') || ' UTC' || chr(10) ||
        'Last answer: ' || coalesce(to_char(rec.last_online_at at time zone 'utc', 'DD Mon YYYY HH24:MI') || ' UTC', 'never') || chr(10) || chr(10) ||
        'We keep checking every 30 minutes and will email you when it answers again.' || chr(10) ||
        'Your report: https://electraindex.com/monitor/r/' || rec.token || chr(10) || monitor_signature(), 300);
      n_down := n_down + 1;
    else
      perform send_email('monitor_alert', rec.email, 'BACK: ' || rec.name || ' is answering again',
        'Hi,' || chr(10) || chr(10) ||
        rec.name || ' answered our check again at ' || to_char(rec.checked_at at time zone 'utc', 'DD Mon YYYY HH24:MI') || ' UTC.' || chr(10) ||
        'Your report: https://electraindex.com/monitor/r/' || rec.token || chr(10) || monitor_signature(), 300);
      n_up := n_up + 1;
    end if;
    update monitor_subs set alerted_status = v_now, last_alert_at = now() where id = rec.id;
  end loop;
  return jsonb_build_object('down_emails', n_down, 'back_emails', n_up);
end $$;
revoke execute on function monitor_alerts() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- public reads (website)
-- ---------------------------------------------------------------------
-- private report: whoever has the secret link
create or replace function monitor_report(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s monitor_subs; v_name text; v_slug text; v_live jsonb;
begin
  select * into s from monitor_subs where token = p_token;
  if not found then return null; end if;
  select name, slug into v_name, v_slug from entities where id = s.entity_id;
  select jsonb_build_object('status', case when l.status in ('online','auth_required') then l.status
                                           when l.consecutive_failures >= 2 then 'down' else 'unconfirmed' end,
                            'last_result', l.status, 'checked_at', l.checked_at, 'last_online_at', l.last_online_at,
                            'tool_count', l.tool_count, 'server_version', l.server_version, 'protocol_version', l.protocol_version)
    into v_live from mcp_live_status l where l.entity_id = s.entity_id;
  return jsonb_build_object(
    'subscription', s.status, 'since', s.created_at, 'canceled_at', s.canceled_at,
    'name', v_name, 'slug', v_slug, 'url', case when s.entity_id is not null then live_check_url(s.entity_id) end,
    'server_ref', s.server_ref,
    'live', v_live,
    'd30', case when s.entity_id is not null then server_history_data(s.entity_id, 30) - 'timeline' - 'method' end,
    'd90', case when s.entity_id is not null then server_history_data(s.entity_id, 90) end);
end $$;
revoke execute on function monitor_report(uuid) from public;
grant execute on function monitor_report(uuid) to anon, authenticated;   -- protected by the secret token

-- badge: public status; the 30-day answer rate is shown for Monitoring Pro servers only
create or replace function monitor_badge(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_pro boolean; r jsonb;
begin
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = p_slug;
  if v_id is null then return null; end if;
  v_pro := exists (select 1 from monitor_subs where entity_id = v_id and status = 'active');
  select jsonb_build_object(
           'status', case when l.status in ('online','auth_required') then l.status
                          when l.consecutive_failures >= 2 then 'down' else 'unconfirmed' end,
           'checked_at', l.checked_at, 'pro', v_pro,
           'rate30', case when v_pro then (select round(100.0 * count(*) filter (where h.status in ('online','auth_required')) / nullif(count(*), 0), 1)
                                             from mcp_live_history h where h.entity_id = v_id and h.checked_at > now() - interval '30 days') end)
    into r from mcp_live_status l where l.entity_id = v_id;
  return coalesce(r, jsonb_build_object('status', 'unchecked', 'pro', v_pro));
end $$;
revoke execute on function monitor_badge(text) from public;
grant execute on function monitor_badge(text) to anon, authenticated;

-- can this server be monitored? (the /monitor page, before sending to Stripe)
create or replace function monitor_check_server(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_url text; e record;
begin
  v_id := monitor_resolve(p_ref);
  if v_id is null then return jsonb_build_object('found', false); end if;
  select slug, name into e from entities where id = v_id;
  v_url := live_check_url(v_id);
  return jsonb_build_object('found', true, 'slug', e.slug, 'name', e.name, 'url', v_url, 'hosted', v_url is not null,
                            'active', exists (select 1 from monitor_subs where entity_id = v_id and status = 'active'));
end $$;
revoke execute on function monitor_check_server(text) from public;
grant execute on function monitor_check_server(text) to anon, authenticated;

-- private report for the SQL Editor
create or replace view v_monitor_report as
select m.created_at, m.status, m.email, e.name as server, e.slug, live_check_url(m.entity_id) as endpoint,
       m.alerted_status, m.last_alert_at, m.stripe_subscription, m.canceled_at
  from monitor_subs m left join entities e on e.id = m.entity_id
 order by m.created_at desc;
revoke all on v_monitor_report from anon, authenticated;
