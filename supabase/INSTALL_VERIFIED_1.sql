-- ELECTRA INDEX — INSTALL_VERIFIED_1 : Electra Verified, pilot (validated by Ami Chat on 25 Nov 2026)
--  Free for publishers of hosted MCP servers who show our badge on their own site or README:
--  live test every 12 hours (separate robot), outage emails, badge with live status + 30-day availability.
--  Pilot: 50 servers, then a waiting list (verified_settings.cap). Nothing changes in scores or rankings.
--  Full lifecycle tested before release (request, confirmation, badge found, display, outage, recovery,
--  waiting list, badge removed -> 7-day grace -> stop, unreachable page never held against the publisher).
--  Undo: ROLLBACK_VERIFIED_1.sql
-- Paste everything in Supabase > SQL Editor > Run. Run it once (re-running is harmless).

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists verified_settings (
  id             int primary key default 1 check (id = 1),
  cap            int not null default 50,     -- active Verified servers (pilot 50 -> 250 -> 1000)
  interval_hours int not null default 12,     -- live check frequency for Verified servers
  recheck_days   int not null default 7,      -- how often we re-read the page that shows the badge
  grace_days     int not null default 7       -- badge missing: days before Verified stops
);
insert into verified_settings(id) values (1) on conflict (id) do nothing;
alter table verified_settings enable row level security;   -- private

create table if not exists verified_subs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  entity_id      uuid not null references entities(id) on delete cascade,
  email          text not null,
  badge_url      text not null,            -- the page where the publisher shows the badge (as given)
  fetch_url      text not null,            -- what the robot reads (raw README for a GitHub repository)
  status         text not null default 'unconfirmed'
                 check (status in ('unconfirmed','checking','active','grace','paused','not_found','waitlist','removed')),
  confirm_token  uuid not null unique default gen_random_uuid(),
  client_hash    text,
  confirmed_at   timestamptz,
  activated_at   timestamptz,
  attempts       int not null default 0,   -- badge searches while "checking"
  request_id     bigint,                   -- pending page read (net.http_get)
  requested_at   timestamptz,
  last_check_at  timestamptz,              -- last conclusive read of the badge page
  last_found_at  timestamptz,
  grace_since    timestamptz,
  alerted_status text,                     -- 'up' | 'down': last state we emailed about
  last_alert_at  timestamptz,
  ended_at       timestamptz
);
-- one live enrolment per server (an unconfirmed request never blocks: it is replaced)
create unique index if not exists uq_verified_live on verified_subs(entity_id)
  where status in ('checking','active','grace','waitlist');
create index if not exists idx_verified_status on verified_subs(status);
alter table verified_subs enable row level security;   -- private

create table if not exists verified_events (
  id      bigserial primary key,
  sub_id  uuid not null references verified_subs(id) on delete cascade,
  at      timestamptz not null default now(),
  event   text not null,
  detail  text
);
alter table verified_events enable row level security;   -- private

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------
create or replace function verified_log(p_sub uuid, p_event text, p_detail text default null) returns void
language sql security definer set search_path = public as $$
  insert into verified_events(sub_id, event, detail) values (p_sub, p_event, p_detail);
$$;
revoke execute on function verified_log(uuid, text, text) from public, anon, authenticated;

-- registrable part of a host: last two labels (example.co.uk -> co.uk is too wide, so 3 labels when the TLD has 2 letters and the 2nd label is short)
create or replace function verified_base_domain(p_host text) returns text language sql immutable as $$
  select case
    when p_host is null or p_host = '' then null
    when array_length(string_to_array(p_host, '.'), 1) >= 3
     and (string_to_array(p_host, '.'))[array_length(string_to_array(p_host, '.'), 1)] ~ '^[a-z]{2}$'
     and length((string_to_array(p_host, '.'))[array_length(string_to_array(p_host, '.'), 1) - 1]) <= 3
      then array_to_string((string_to_array(p_host, '.'))[array_length(string_to_array(p_host, '.'), 1) - 2 : array_length(string_to_array(p_host, '.'), 1)], '.')
    else array_to_string((string_to_array(p_host, '.'))[greatest(array_length(string_to_array(p_host, '.'), 1) - 1, 1) : array_length(string_to_array(p_host, '.'), 1)], '.')
  end
$$;

-- domains where many unrelated publishers have their own sub-domain: only an exact host match counts there
create or replace function verified_shared_domain(p_base text) returns boolean language sql immutable as $$
  select coalesce(p_base, '') in ('vercel.app','netlify.app','github.io','pages.dev','workers.dev','onrender.com','herokuapp.com',
    'fly.dev','railway.app','up.railway.app','deno.dev','replit.app','repl.co','glitch.me','azurewebsites.net','cloudfunctions.net',
    'run.app','appspot.com','amazonaws.com','on.aws','supabase.co','firebaseapp.com','web.app','smithery.ai','apify.com','apify.actor',
    'modal.run','ngrok.app','ngrok-free.app','trycloudflare.com','gitbook.io','notion.site','webflow.io','framer.website','wixsite.com',
    'medium.com','substack.com','huggingface.co','hf.space','mcp.ai','pipeworx.io','glama.ai','mcp.so','pulsemcp.com','lobehub.com')
$$;

create or replace function verified_host(p_url text) returns text language sql immutable as $$
  select nullif(regexp_replace(lower(substring(coalesce(p_url, '') from '^https?://([^/?#:]+)')), '^www\.', ''), '')
$$;

-- what the robot reads: for a GitHub repository, its README (raw), otherwise the page itself
create or replace function verified_fetch_url(p_badge_url text) returns text language sql immutable as $$
  select case
    when p_badge_url ~* '^https?://(www\.)?github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?($|[?#]|/(blob|tree)/)'
         and p_badge_url !~* '/blob/'
      then 'https://raw.githubusercontent.com/' || substring(p_badge_url from '(?i)github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)') || '/HEAD/README.md'
    when p_badge_url ~* '^https?://(www\.)?github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/blob/'
      then regexp_replace(regexp_replace(p_badge_url, '(?i)^https?://(www\.)?github\.com/', 'https://raw.githubusercontent.com/'), '/blob/', '/')
    else p_badge_url
  end
$$;

-- is this page the publisher's own? (its website or endpoint domain, or its GitHub repository)
create or replace function verified_owner_page(p_entity uuid, p_badge_url text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare e entities; v_host text := verified_host(p_badge_url); v_repo text;
begin
  select * into e from entities where id = p_entity;
  if v_host is null then return false; end if;
  if v_host in ('github.com', 'raw.githubusercontent.com') then
    v_repo := lower(substring(coalesce(e.attributes->'repository.url'->>'value', '') from '(?i)github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)'));
    return v_repo is not null
       and lower(substring(p_badge_url from '(?i)github(?:usercontent)?\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)')) = regexp_replace(v_repo, '\.git$', '');
  end if;
  -- the endpoint host must match exactly (hosting platforms serve many publishers on one domain);
  -- the website may be any page of the same domain, unless that domain is a shared platform
  if v_host = verified_host(live_check_url(p_entity)) then return true; end if;
  return exists (
    select 1 from unnest(array[verified_host(e.website), verified_host(e.attributes->'website.url'->>'value')]) w(h)
     where w.h is not null
       and (w.h = v_host
            or (verified_base_domain(w.h) = verified_base_domain(v_host) and not verified_shared_domain(verified_base_domain(v_host)))));
end $$;
revoke execute on function verified_owner_page(uuid, text) from public, anon, authenticated;

create or replace function verified_signature() returns text language sql immutable as $$
  select chr(10) || '--' || chr(10) || 'Electra Index · independent MCP monitoring' || chr(10) ||
         'Electra Verified never changes a score or a ranking: https://electraindex.com/sources#what-we-sell' || chr(10) ||
         'Questions: contact@electraindex.com'
$$;

create or replace function verified_snippet(p_slug text) returns text language sql immutable as $$
  select '<a href="https://electraindex.com/mcp/' || p_slug || '" rel="nofollow"><img src="https://electraindex.com/api/badge/' || p_slug || '/card" width="260" height="72" alt="Electra Verified"></a>' || chr(10) ||
         'or, in a README: [![Electra Index](https://electraindex.com/api/badge/' || p_slug || ')](https://electraindex.com/mcp/' || p_slug || ')'
$$;

-- ---------------------------------------------------------------------
-- 3. Public: request and confirm (website form, no account)
-- ---------------------------------------------------------------------
create or replace function verified_request(p_ref text, p_email text, p_badge_url text, p_client text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; e entities; v_email text := lower(btrim(coalesce(p_email, ''))); v_url text := btrim(coalesce(p_badge_url, ''));
        v_hash text; v_sub verified_subs;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('status', 'invalid_email'); end if;
  if v_url !~* '^https?://[^\s]+$' or length(v_url) > 500 then return jsonb_build_object('status', 'invalid_url'); end if;
  v_hash := md5(coalesce(nullif(p_client, ''), 'unknown') || ':' || current_date::text || ':electra-verified');
  if (select count(*) from verified_subs where client_hash = v_hash and created_at > now() - interval '1 day') >= 5
     or (select count(*) from verified_subs where email = v_email and created_at > now() - interval '1 day') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  v_id := monitor_resolve(p_ref);
  if v_id is null then return jsonb_build_object('status', 'not_found'); end if;
  select * into e from entities where id = v_id;
  if live_check_url(v_id) is null then return jsonb_build_object('status', 'not_hosted', 'name', e.name, 'slug', e.slug); end if;
  if not verified_owner_page(v_id, v_url) then return jsonb_build_object('status', 'not_owner_page', 'name', e.name, 'slug', e.slug); end if;
  if exists (select 1 from verified_subs where entity_id = v_id and status in ('checking','active','grace','waitlist')) then
    return jsonb_build_object('status', 'already', 'name', e.name, 'slug', e.slug);
  end if;
  update verified_subs set status = 'removed', ended_at = now() where entity_id = v_id and status = 'unconfirmed';
  insert into verified_subs(entity_id, email, badge_url, fetch_url, client_hash)
  values (v_id, v_email, v_url, verified_fetch_url(v_url), v_hash) returning * into v_sub;
  perform verified_log(v_sub.id, 'requested', v_url);
  perform send_email('verified_confirm', v_email, 'Confirm Electra Verified for ' || e.name,
    'Hi,' || chr(10) || chr(10) ||
    'Someone (hopefully you) asked to make ' || e.name || ' Electra Verified, with the badge shown on:' || chr(10) || v_url || chr(10) || chr(10) ||
    'Press the button on this page to confirm, then we look for the badge:' || chr(10) ||
    'https://electraindex.com/verified/confirm?t=' || v_sub.confirm_token || chr(10) || chr(10) ||
    'If the badge is not there yet, add this code to that page:' || chr(10) || verified_snippet(e.slug) || chr(10) || chr(10) ||
    'Not you? Ignore this email: nothing starts without the confirmation.' || verified_signature(), 300);
  return jsonb_build_object('status', 'confirm_sent', 'name', e.name, 'slug', e.slug);
end $$;
revoke execute on function verified_request(text, text, text, text) from public;
grant execute on function verified_request(text, text, text, text) to anon, authenticated;

create or replace function verified_confirm(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, net as $$
declare s verified_subs; v_name text; v_slug text;
begin
  select * into s from verified_subs where confirm_token = p_token;
  if not found or s.status <> 'unconfirmed' or s.created_at < now() - interval '3 days' then return null; end if;
  if exists (select 1 from verified_subs where entity_id = s.entity_id and id <> s.id and status in ('checking','active','grace','waitlist')) then
    update verified_subs set status = 'removed', ended_at = now() where id = s.id;
    return null;
  end if;
  update verified_subs set status = 'checking', confirmed_at = now(), attempts = 0,
         request_id = net.http_get(url := s.fetch_url, headers := jsonb_build_object('User-Agent', 'ElectraIndexBot/1.0 (+https://electraindex.com)'),
                                   timeout_milliseconds := 10000),
         requested_at = now()
   where id = s.id;
  perform verified_log(s.id, 'confirmed', null);
  select name, slug into v_name, v_slug from entities where id = s.entity_id;
  return jsonb_build_object('name', v_name, 'slug', v_slug);
end $$;
revoke execute on function verified_confirm(uuid) from public;
grant execute on function verified_confirm(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Robot: read the badge pages (cron every 15 minutes)
-- ---------------------------------------------------------------------
create or replace function verified_fetch() returns int
language plpgsql security definer set search_path = public, net as $$
declare r record; st verified_settings; n int := 0;
begin
  select * into st from verified_settings where id = 1;
  for r in
    select id, fetch_url from verified_subs
     where request_id is null
       and (requested_at is null or requested_at < now() - interval '6 hours')
       and (   status = 'checking'
            or (status = 'active' and (last_check_at is null or last_check_at < now() - make_interval(days => st.recheck_days)))
            or (status = 'grace'  and (last_check_at is null or last_check_at < now() - interval '1 day')))
     order by requested_at nulls first
     limit 100
  loop
    update verified_subs
       set request_id = net.http_get(url := r.fetch_url, headers := jsonb_build_object('User-Agent', 'ElectraIndexBot/1.0 (+https://electraindex.com)'),
                                     timeout_milliseconds := 10000),
           requested_at = now()
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function verified_fetch() from public, anon, authenticated;

-- is the badge or link of this server on the page?
create or replace function verified_badge_found(p_html text, p_slug text) returns boolean language sql immutable as $$
  select coalesce(p_html, '') ~* ('electraindex\.com/(mcp|api/badge)/' || p_slug || '([^a-z0-9-]|$)')
$$;

create or replace function verified_active_count() returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from verified_subs where status in ('active','grace')
$$;
revoke execute on function verified_active_count() from public, anon, authenticated;

-- apply the answers (cron every 15 minutes)
create or replace function verified_parse() returns jsonb
language plpgsql security definer set search_path = public, net as $$
declare r record; st verified_settings; v_found boolean; v_ok boolean; n int := 0; w record;
begin
  select * into st from verified_settings where id = 1;
  for r in
    select s.*, e.name, e.slug, h.status_code, h.content, (h.id is null) as lost
      from verified_subs s
      join entities e on e.id = s.entity_id
      left join net._http_response h on h.id = s.request_id
     where s.request_id is not null
       and (h.id is not null or s.requested_at < now() - interval '1 hour')
  loop
    v_ok := not r.lost and r.status_code between 200 and 299;
    v_found := v_ok and verified_badge_found(left(r.content, 3000000), r.slug);
    update verified_subs set request_id = null where id = r.id;
    if not v_ok then
      -- page unreachable: inconclusive, never held against the publisher; tried again in 6 hours
      perform verified_log(r.id, 'page_unreachable', coalesce(r.status_code::text, 'no answer'));
      if r.status = 'checking' then
        update verified_subs set attempts = attempts + 1 where id = r.id;
        if r.attempts + 1 >= 4 then
          update verified_subs set status = 'not_found', ended_at = now() where id = r.id;
          perform verified_log(r.id, 'not_found', 'page unreachable');
          perform send_email('verified_status', r.email, 'Electra Verified: we could not read ' || r.badge_url,
            'Hi,' || chr(10) || chr(10) || 'We tried 4 times to read the page where the badge of ' || r.name || ' should be, without an answer:' || chr(10) ||
            r.badge_url || chr(10) || chr(10) || 'You can ask again any time: https://electraindex.com/verified' || verified_signature(), 300);
        end if;
      end if;
      continue;
    end if;
    update verified_subs set last_check_at = now() where id = r.id;
    n := n + 1;
    if r.status = 'checking' then
      if v_found then
        if verified_active_count() < st.cap then
          update verified_subs set status = 'active', activated_at = now(), last_found_at = now(), attempts = 0 where id = r.id;
          perform verified_log(r.id, 'activated', null);
          perform send_email('verified_status', r.email, r.name || ' is now Electra Verified',
            'Hi,' || chr(10) || chr(10) || 'We found the Electra Index badge on ' || r.badge_url || '.' || chr(10) || chr(10) ||
            'From now on, as long as the badge stays there:' || chr(10) ||
            '- ' || r.name || ' is tested every ' || st.interval_hours || ' hours (instead of about every 2 days);' || chr(10) ||
            '- you get an email when it stops answering and when it is back;' || chr(10) ||
            '- the badge shows its 30-day availability next to its live status.' || chr(10) || chr(10) ||
            'Your public page: https://electraindex.com/mcp/' || r.slug || chr(10) ||
            'We check the badge once a week. If it disappears, we warn you and keep Verified for ' || st.grace_days || ' more days.' || chr(10) || chr(10) ||
            'Want a check every 30 minutes, alerts within the hour and a private 90-day report? Monitoring Pro: https://electraindex.com/monitor' ||
            verified_signature(), 300);
        else
          update verified_subs set status = 'waitlist', last_found_at = now() where id = r.id;
          perform verified_log(r.id, 'waitlist', null);
          perform send_email('verified_status', r.email, r.name || ': badge found, you are on the Electra Verified waiting list',
            'Hi,' || chr(10) || chr(10) || 'We found the badge, thank you. The pilot is full for now (' || st.cap || ' servers); ' || r.name ||
            ' is on the waiting list and starts automatically when a place opens. Keep the badge in place.' || verified_signature(), 300);
        end if;
      else
        update verified_subs set attempts = attempts + 1 where id = r.id;
        perform verified_log(r.id, 'badge_missing', 'attempt ' || (r.attempts + 1));
        if r.attempts + 1 >= 4 then
          update verified_subs set status = 'not_found', ended_at = now() where id = r.id;
          perform verified_log(r.id, 'not_found', null);
          perform send_email('verified_status', r.email, 'Electra Verified: no badge found for ' || r.name,
            'Hi,' || chr(10) || chr(10) || 'We looked 4 times for the badge of ' || r.name || ' on ' || r.badge_url || ' and did not find it.' || chr(10) ||
            'The page must contain a link or image pointing to https://electraindex.com/mcp/' || r.slug || ', for example:' || chr(10) ||
            verified_snippet(r.slug) || chr(10) || chr(10) || 'Once it is there, ask again: https://electraindex.com/verified' || verified_signature(), 300);
        end if;
      end if;
    elsif r.status = 'active' then
      if v_found then
        update verified_subs set last_found_at = now() where id = r.id;
      else
        update verified_subs set status = 'grace', grace_since = now() where id = r.id;
        perform verified_log(r.id, 'grace', null);
        perform send_email('verified_status', r.email, 'Electra Verified: the badge of ' || r.name || ' is no longer on your page',
          'Hi,' || chr(10) || chr(10) || 'Our weekly check did not find the Electra Index badge on ' || r.badge_url || '.' || chr(10) ||
          'Verified (tests every ' || st.interval_hours || ' hours and outage emails) continues for ' || st.grace_days || ' days. ' ||
          'Put the badge back before then and nothing changes:' || chr(10) || verified_snippet(r.slug) || verified_signature(), 300);
      end if;
    elsif r.status = 'grace' then
      if v_found then
        update verified_subs set status = 'active', grace_since = null, last_found_at = now() where id = r.id;
        perform verified_log(r.id, 'back_active', null);
      elsif r.grace_since < now() - make_interval(days => st.grace_days) then
        update verified_subs set status = 'paused', ended_at = now() where id = r.id;
        perform verified_log(r.id, 'paused', null);
        perform send_email('verified_status', r.email, 'Electra Verified has stopped for ' || r.name,
          'Hi,' || chr(10) || chr(10) || 'The badge has not been on ' || r.badge_url || ' for ' || st.grace_days || ' days, so ' || r.name ||
          ' is back to our standard tests (about every 2 days) and outage emails have stopped. Its public page and score are unchanged.' || chr(10) ||
          'You can come back any time: https://electraindex.com/verified' || verified_signature(), 300);
      end if;
    end if;
  end loop;

  -- a place opened: the oldest server on the waiting list is checked again
  for w in
    select id from verified_subs where status = 'waitlist' order by created_at
     limit greatest(st.cap - verified_active_count() - (select count(*)::int from verified_subs where status = 'checking'), 0)
  loop
    update verified_subs set status = 'checking', attempts = 0, requested_at = null where id = w.id;
    perform verified_log(w.id, 'from_waitlist', null);
  end loop;
  return jsonb_build_object('pages_read', n);
end $$;
revoke execute on function verified_parse() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Robot Verified: live checks every 12 h, failed check confirmed 30 min later (cron every 30 minutes)
--    Separate from the coverage robot (live_check_dispatch). Servers on Monitoring Pro are already checked every 30 min.
-- ---------------------------------------------------------------------
create or replace function verified_dispatch() returns int
language plpgsql security definer set search_path = public, net as $$
declare rec record; rid bigint; n int := 0; st verified_settings;
begin
  select * into st from verified_settings where id = 1;
  for rec in
    select distinct v.entity_id as id, live_check_url(v.entity_id) as url
      from verified_subs v
      left join mcp_live_status l on l.entity_id = v.entity_id
     where v.status in ('active','grace')
       and not exists (select 1 from monitor_subs m where m.entity_id = v.entity_id and m.status = 'active')
       and not exists (select 1 from mcp_live_checks c where c.entity_id = v.entity_id and c.dispatched_at > now() - interval '25 minutes')
       and (   not exists (select 1 from mcp_live_checks c where c.entity_id = v.entity_id
                            and c.dispatched_at > now() - make_interval(hours => st.interval_hours) + interval '10 minutes')
            or coalesce(l.consecutive_failures, 0) = 1)          -- confirm a failure quickly
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
revoke execute on function verified_dispatch() from public, anon, authenticated;

-- outage / recovery emails (cron every 30 minutes)
create or replace function verified_alerts() returns jsonb language plpgsql security definer set search_path = public as $$
declare rec record; n_down int := 0; n_up int := 0; v_now text;
begin
  for rec in
    select v.id, v.email, v.alerted_status, e.name, e.slug, s.url, s.status, s.last_online_at, s.checked_at,
           case when s.status in ('online','auth_required') then 'up'
                when s.consecutive_failures >= 2 then 'down' end as now_status
      from verified_subs v
      join entities e on e.id = v.entity_id
      join mcp_live_status s on s.entity_id = v.entity_id
     where v.status in ('active','grace')
       and not exists (select 1 from monitor_subs m where m.entity_id = v.entity_id and m.status = 'active')   -- Pro sends its own
  loop
    v_now := rec.now_status;
    continue when v_now is null or v_now = rec.alerted_status;
    if rec.alerted_status is null then
      update verified_subs set alerted_status = v_now where id = rec.id;
      continue;
    end if;
    if v_now = 'down' then
      perform send_email('verified_alert', rec.email, 'DOWN: ' || rec.name || ' is not answering',
        'Hi,' || chr(10) || chr(10) ||
        rec.name || ' did not answer our last 2 checks in a row (' || rec.status || ').' || chr(10) ||
        'Endpoint: ' || rec.url || chr(10) ||
        'Last check: ' || to_char(rec.checked_at at time zone 'utc', 'DD Mon YYYY HH24:MI') || ' UTC' || chr(10) ||
        'Last answer: ' || coalesce(to_char(rec.last_online_at at time zone 'utc', 'DD Mon YYYY HH24:MI') || ' UTC', 'never') || chr(10) || chr(10) ||
        'Your badge and public page show it as not responding until it answers again. We email you when it is back.' || chr(10) ||
        'Page: https://electraindex.com/mcp/' || rec.slug || verified_signature(), 300);
      n_down := n_down + 1;
    else
      perform send_email('verified_alert', rec.email, 'BACK: ' || rec.name || ' is answering again',
        'Hi,' || chr(10) || chr(10) ||
        rec.name || ' answered our check again at ' || to_char(rec.checked_at at time zone 'utc', 'DD Mon YYYY HH24:MI') || ' UTC.' || chr(10) ||
        'Page: https://electraindex.com/mcp/' || rec.slug || verified_signature(), 300);
      n_up := n_up + 1;
    end if;
    update verified_subs set alerted_status = v_now, last_alert_at = now() where id = rec.id;
  end loop;
  return jsonb_build_object('down_emails', n_down, 'back_emails', n_up);
end $$;
revoke execute on function verified_alerts() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Public reads: badge and MCP page
-- ---------------------------------------------------------------------
-- badge: live status always; the 30-day availability for Monitoring Pro and Verified servers (shared calculation, from 10 checks)
create or replace function monitor_badge(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_pro boolean; v_ver boolean; r jsonb;
begin
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = p_slug;
  if v_id is null then return null; end if;
  v_pro := exists (select 1 from monitor_subs where entity_id = v_id and status = 'active');
  v_ver := exists (select 1 from verified_subs where entity_id = v_id and status in ('active','grace'));
  select jsonb_build_object(
           'status', case when l.status in ('online','auth_required') then l.status
                          when l.consecutive_failures >= 2 then 'down' else 'unconfirmed' end,
           'checked_at', l.checked_at, 'pro', v_pro, 'verified', v_ver,
           'rate30', case when v_pro or v_ver then (mcp_obs(v_id, 30)->>'availability')::numeric end)
    into r from mcp_live_status l where l.entity_id = v_id;
  return coalesce(r, jsonb_build_object('status', 'unchecked', 'pro', v_pro, 'verified', v_ver));
end $$;
revoke execute on function monitor_badge(text) from public;
grant execute on function monitor_badge(text) to anon, authenticated;

-- MCP page: same as 0069, plus the 12-hour frequency and the Verified flag
create or replace function mcp_public_reliability(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_pro boolean; v_ver boolean;
begin
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = p_slug;
  if v_id is null then return null; end if;
  v_pro := exists (select 1 from monitor_subs where entity_id = v_id and status = 'active');
  v_ver := exists (select 1 from verified_subs where entity_id = v_id and status in ('active','grace'));
  return jsonb_build_object(
    'd30', mcp_obs(v_id, 30),
    'history_since', (select min(checked_at) from mcp_live_history where entity_id = v_id),
    'frequency', case when v_pro then '30min' when v_ver then '12h' else 'standard' end,
    'verified', v_ver,
    'checks', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'c', cls) order by checked_at), '[]')
                 from (select x.checked_at,
                              case when exists (select 1 from mcp_check_incidents i where i.window_start = mcp_window(x.checked_at)) then 'excluded'
                                   else mcp_check_class(x.status, x.http) end as cls
                         from mcp_live_history x
                        where x.entity_id = v_id and x.checked_at > now() - interval '30 days'
                        order by x.checked_at desc limit 60) k),
    'tool_changes', mcp_tool_changes(v_id));
end $$;
revoke execute on function mcp_public_reliability(text) from public;
grant execute on function mcp_public_reliability(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Schedules
-- ---------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('electra-verified-fetch', 'electra-verified-parse', 'electra-verified-dispatch', 'electra-verified-alerts');
select cron.schedule('electra-verified-fetch',    '2,17,32,47 * * * *', $job$ select verified_fetch(); $job$);
select cron.schedule('electra-verified-parse',    '9,24,39,54 * * * *', $job$ select verified_parse(); $job$);
select cron.schedule('electra-verified-dispatch', '15,45 * * * *',      $job$ select verified_dispatch(); $job$);
select cron.schedule('electra-verified-alerts',   '25,55 * * * *',      $job$ select verified_alerts(); $job$);

-- ---------------------------------------------------------------------
-- 8. Check (one table; nothing is changed by these lines)
-- ---------------------------------------------------------------------
select 'pilot cap' as check_name, cap::text as result from verified_settings
union all select 'test every (hours)', interval_hours::text from verified_settings
union all select 'schedules installed', count(*)::text from cron.job where jobname like 'electra-verified-%'
union all select 'Verified servers now', count(*)::text from verified_subs where status in ('active','grace')
union all select 'badge function answers', coalesce((select monitor_badge(slug)::text from entities e join mcp_live_status l on l.entity_id = e.id
                                                     where e.type = 'mcp_server' and e.is_published limit 1), 'no server');
