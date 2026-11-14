-- =====================================================================
-- ELECTRA INDEX — INSTALL_OUTREACH_NEW_MCP
--  Every day, one email to the NEW hosted MCP servers published by a real company:
--  "your server is listed and tested on Electra Index — add your free badge".
--
--  Who gets it (all conditions):
--   * MCP server first seen in the last 3 days, published, with an endpoint our robot tests
--     and last result "online" or "reachable, asks for a key";
--   * a company website of its own (not GitHub, npm, Hugging Face, Vercel/Netlify subdomains...),
--     not a German or Austrian domain (.de / .at — strict consent rules there);
--   * a GENERIC address found on that website (contact@, hello@, partners@, team@, info@...),
--     on the company's own domain — never a personal address;
--   * one email per company domain, ever. Never to someone who already received an
--     Electra Index email, submitted a listing request, or unsubscribed.
--  Limits: 60 websites read per day, 20 emails per day max. One-click unsubscribe (RFC 8058).
--
--  Schedule (UTC): 05:30 pick + read websites · 05:45-07:45 find addresses (homepage, then /contact)
--                  · 08:00 send (= 9:00 Zurich).
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable. Sends nothing when installed.
-- =====================================================================

create table if not exists outreach_mcp (
  entity_id     uuid primary key references entities(id) on delete cascade,
  created_at    timestamptz not null default now(),
  website       text not null,
  domain        text not null,
  step          text not null default 'home' check (step in ('home','contact','done')),
  request_id    bigint,
  fetched_at    timestamptz,
  contact_email text,
  status        text not null default 'fetching'
                check (status in ('fetching','no_email','ready','sent','skipped','unsubscribed')),
  skip_reason   text,
  unsub_token   uuid not null default gen_random_uuid(),
  sent_at       timestamptz
);
create index if not exists idx_outreach_mcp_status on outreach_mcp(status);
create index if not exists idx_outreach_mcp_domain on outreach_mcp(domain);
create unique index if not exists uq_outreach_mcp_token on outreach_mcp(unsub_token);
alter table outreach_mcp enable row level security;        -- private: no policy, no grant

create table if not exists outreach_suppress (               -- unsubscribed addresses and domains
  value      text primary key,
  created_at timestamptz not null default now()
);
alter table outreach_suppress enable row level security;   -- private

-- ---------------------------------------------------------------------
-- 1. Pick today's candidates and start reading their homepage
-- ---------------------------------------------------------------------
create or replace function outreach_pick(p_limit int default 60) returns int
language plpgsql security definer set search_path = public, net as $$
declare r record; n int := 0;
begin
  for r in
    select * from (
    select distinct on (c.dom) c.id, c.url, c.dom, c.first_seen_at
      from (select e.id, e.first_seen_at,
                   u.url,
                   lower(regexp_replace(u.url, '^https?://(www\.)?([^/:?#]+).*$', '\2')) as dom
              from entities e
              cross join lateral (select coalesce(nullif(e.website, ''), e.attributes->'website.url'->>'value') as url) u
             where e.type = 'mcp_server' and e.is_published
               and e.first_seen_at > now() - interval '3 days'
               and u.url ~* '^https?://'
               and live_check_url(e.id) is not null
               and exists (select 1 from mcp_live_status l
                            where l.entity_id = e.id and l.status in ('online', 'auth_required'))) c
     where c.dom !~ '(^|\.)(github\.com|github\.io|gitlab\.com|gitlab\.io|bitbucket\.org|npmjs\.com|pypi\.org|huggingface\.co|hf\.space|smithery\.ai|glama\.ai|mcp\.so|pulsemcp\.com|modelcontextprotocol\.io|vercel\.app|netlify\.app|pages\.dev|workers\.dev|railway\.app|onrender\.com|herokuapp\.com|replit\.app|repl\.co|fly\.dev|deno\.dev|notion\.site|medium\.com|substack\.com|linkedin\.com|x\.com|twitter\.com|google\.com|electraindex\.com)$'
       and c.dom !~ '\.(de|at)$'
       and not exists (select 1 from outreach_mcp o where o.entity_id = c.id or o.domain = c.dom)
       and not exists (select 1 from outreach_suppress s where s.value = c.dom)
     order by c.dom, c.first_seen_at desc
    ) d
    order by d.first_seen_at desc
    limit p_limit
  loop
    insert into outreach_mcp(entity_id, website, domain) values (r.id, r.url, r.dom) on conflict do nothing;
    n := n + 1;
  end loop;

  -- start reading the homepages (answers arrive in net._http_response)
  for r in select entity_id, website from outreach_mcp where status = 'fetching' and request_id is null loop
    update outreach_mcp
       set request_id = net.http_get(url := r.website,
                                     headers := jsonb_build_object('User-Agent', 'ElectraIndexBot/1.0 (+https://electraindex.com)'),
                                     timeout_milliseconds := 8000)
     where entity_id = r.entity_id;
  end loop;
  return n;
end $$;
revoke execute on function outreach_pick(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Find a generic address on the company's own domain
-- ---------------------------------------------------------------------
create or replace function outreach_find_email(p_html text, p_domain text) returns text
language sql immutable as $$
  select x.email
    from (select lower(m[1]) as email
            from regexp_matches(coalesce(p_html, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') m) x
   where (split_part(x.email, '@', 2) = p_domain
          or p_domain like '%.' || split_part(x.email, '@', 2)
          or split_part(x.email, '@', 2) like '%.' || p_domain)
     and split_part(x.email, '@', 1) ~ '^(partners?|partnerships|hello|hi|contact|team|info|business|bd|sales|press|media|marketing|founders|developers|dev|integrations|mcp|api|support|help)$'
   order by case split_part(x.email, '@', 1)
              when 'partners' then 1 when 'partner' then 1 when 'partnerships' then 1
              when 'hello' then 2 when 'contact' then 2 when 'hi' then 2 when 'team' then 3
              when 'founders' then 3 when 'business' then 4 when 'info' then 4
              when 'support' then 9 when 'help' then 9 else 5 end
   limit 1
$$;

create or replace function outreach_parse() returns int
language plpgsql security definer set search_path = public, net as $$
declare r record; v_email text; v_base text; n int := 0;
begin
  for r in
    select o.entity_id, o.step, o.website, o.domain, h.content, h.created as answered_at,
           (h.id is null and o.fetched_at is null and o.created_at < now() - interval '1 hour') as lost
      from outreach_mcp o
      left join net._http_response h on h.id = o.request_id
     where o.status = 'fetching' and o.request_id is not null
       and (h.id is not null or o.created_at < now() - interval '1 hour')
  loop
    v_email := case when r.lost then null else outreach_find_email(left(r.content, 2000000), r.domain) end;
    if v_email is not null then
      update outreach_mcp set status = 'ready', contact_email = v_email, step = 'done', fetched_at = now()
       where entity_id = r.entity_id;
      n := n + 1;
    elsif r.step = 'home' then          -- nothing on the homepage: try /contact once
      v_base := regexp_replace(r.website, '^(https?://[^/?#]+).*$', '\1');
      update outreach_mcp
         set step = 'contact', created_at = now(), fetched_at = null,
             request_id = net.http_get(url := v_base || '/contact',
                                       headers := jsonb_build_object('User-Agent', 'ElectraIndexBot/1.0 (+https://electraindex.com)'),
                                       timeout_milliseconds := 8000)
       where entity_id = r.entity_id;
    else
      update outreach_mcp set status = 'no_email', step = 'done', fetched_at = now() where entity_id = r.entity_id;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function outreach_parse() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. The email (text + html with the badge image)
-- ---------------------------------------------------------------------
create or replace function outreach_message(p_entity uuid, p_unsub uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare e record; l record; v_page text; v_burl text; v_url text; v_live text; v_total text;
        v_code text; t1 text; t2 text; v_text text; v_html text; v_subject text;
begin
  select id, slug, name into e from entities where id = p_entity;
  if e.id is null then return null; end if;
  select * into l from mcp_live_status where entity_id = e.id;
  v_page := 'https://electraindex.com/mcp/' || e.slug;
  v_burl := v_page || '?utm_source=badge&utm_medium=email&utm_campaign=new_server';
  v_url  := live_check_url(e.id);
  v_live := case when l.status = 'online' then 'online' || coalesce(', ' || l.tool_count || ' tools listed', '')
                 when l.status = 'auth_required' then 'reachable, asks for a key (normal for a private or paid server)'
                 else 'checked' end;
  select to_char((count(*) / 1000) * 1000, 'FM999,999') into v_total
    from entities where type = 'mcp_server' and is_published;
  v_code := '<a href="' || v_burl || '"><img src="https://electraindex.com/api/badge/' || e.slug || '/card" width="260" height="72" alt="Listed on Electra Index"></a>';
  v_subject := e.name || ' is independently listed and tested on Electra Index';

  t1 := 'Hi ' || e.name || ' team,' || chr(10) || chr(10) ||
        'Good news: ' || e.name || ' is now listed on Electra Index, the independent index of the agent economy that tracks more than ' || v_total || ' MCP servers.' || chr(10) || chr(10) ||
        'Your page: ' || v_page || chr(10) || chr(10) ||
        'We don''t just list your server, we test it. Our robot connects to ' || coalesce(v_url, 'your endpoint') || ' the way an AI assistant would. Last result: ' || v_live || '.' || chr(10) ||
        'Listings on Electra Index are never paid for: ' || e.name || ' is there because it is live and verifiable.' || chr(10);
  t2 := 'Want to know the moment your server stops answering? Monitoring Pro checks it every 30 minutes: https://electraindex.com/monitor?server=' || e.slug || chr(10) || chr(10) ||
        'Best regards,' || chr(10) || chr(10) ||
        'Tony Nelson' || chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com' || chr(10) || chr(10) ||
        'You are receiving this one-time email because ' || e.name || ' is published in the Official MCP Registry and your address is listed on your website. We will not email you again. Unsubscribe: https://electraindex.com/unsubscribe?t=' || p_unsub || chr(10);

  v_text := t1 || chr(10) ||
            'SHOW IT TO YOUR USERS: ADD YOUR FREE BADGE' || chr(10) ||
            'Developers and AI teams use Electra Index to choose which MCP servers they can trust. The badge tells your visitors that ' || e.name || ' is independently listed and tested. Paste this code in your website footer or README (30 seconds):' || chr(10) || chr(10) ||
            v_code || chr(10) || chr(10) ||
            'Copy it in one click, or announce it on LinkedIn in one click: ' || v_page || '#share' || chr(10) || chr(10) || t2;

  v_html := email_html(t1) ||
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:18px 0;padding:18px;border:1px solid #C9D4FF;border-radius:10px;background:#F3F6FF;color:#121816">' ||
      '<div style="font-size:15px;font-weight:700;margin-bottom:6px">Show it to your users: add your free badge</div>' ||
      '<div style="font-size:14px;line-height:1.5;margin-bottom:12px">Developers and AI teams use Electra Index to choose which MCP servers they can trust. The badge tells your visitors that ' || html_esc(e.name) || ' is independently listed and tested.</div>' ||
      v_code ||
      '<div style="margin-top:14px"><a href="' || v_page || '#share" style="display:inline-block;background:#1F3FD1;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 16px;border-radius:8px">Copy your badge code in one click</a></div>' ||
      '<div style="font-size:13px;color:#4A5552;margin-top:8px">Website footer or GitHub README, 30 seconds. Or announce it on LinkedIn in one click from the same page.</div>' ||
    '</div>' ||
    email_html(t2);
  return jsonb_build_object('subject', v_subject, 'text', v_text, 'html', v_html);
end $$;
revoke execute on function outreach_message(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Send (max p_cap a day, never twice, never to unsubscribed people)
-- ---------------------------------------------------------------------
create or replace function outreach_send(p_cap int default 20) returns int
language plpgsql security definer set search_path = public, net, vault as $$
declare r record; m jsonb; v_key text; rid bigint; n int := 0; v_done int;
begin
  select count(*) into v_done from notify_log
   where kind = 'outreach_new_mcp' and created_at > now() - interval '1 day' and skipped is null;
  if v_done >= p_cap then return 0; end if;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then v_key := null;
  end;
  if coalesce(v_key, '') = '' then return 0; end if;

  for r in select o.* from outreach_mcp o where o.status = 'ready' order by o.created_at limit (p_cap - v_done) loop
    if exists (select 1 from outreach_suppress s where s.value in (lower(r.contact_email), r.domain))
       or exists (select 1 from page_followers f where lower(f.email) = lower(r.contact_email) and f.unsubscribed_at is not null) then
      update outreach_mcp set status = 'unsubscribed' where entity_id = r.entity_id; continue;
    end if;
    if exists (select 1 from notify_log nl where lower(nl.recipient) = lower(r.contact_email) and nl.skipped is null) then
      update outreach_mcp set status = 'skipped', skip_reason = 'already received an Electra Index email' where entity_id = r.entity_id; continue;
    end if;
    if exists (select 1 from submissions s where lower(s.contact_email) = lower(r.contact_email)) then
      update outreach_mcp set status = 'skipped', skip_reason = 'submitted a listing request' where entity_id = r.entity_id; continue;
    end if;
    m := outreach_message(r.entity_id, r.unsub_token);
    if m is null then
      update outreach_mcp set status = 'skipped', skip_reason = 'server page not found' where entity_id = r.entity_id; continue;
    end if;
    select net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body    := jsonb_build_object('from', 'Tony Nelson, Electra Index <notifications@electraindex.com>',
                                    'to', jsonb_build_array(r.contact_email), 'reply_to', 'contact@electraindex.com',
                                    'subject', left(m->>'subject', 200), 'text', m->>'text', 'html', m->>'html',
                                    'headers', jsonb_build_object(
                                      'List-Unsubscribe', '<https://electraindex.com/api/unsubscribe?t=' || r.unsub_token || '>, <mailto:contact@electraindex.com?subject=unsubscribe>',
                                      'List-Unsubscribe-Post', 'List-Unsubscribe=One-Click')),
      timeout_milliseconds := 10000) into rid;
    insert into notify_log(kind, subject, recipient, request_id, entity_id)
    values ('outreach_new_mcp', m->>'subject', r.contact_email, rid, r.entity_id);
    update outreach_mcp set status = 'sent', sent_at = now() where entity_id = r.entity_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function outreach_send(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. One-click unsubscribe also covers these emails (same page, same link format)
-- ---------------------------------------------------------------------
create or replace function unsubscribe_follow(p_token uuid, p_all boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare v_email text; n int; o record;
begin
  select email into v_email from page_followers where unsub_token = p_token;
  if v_email is null then
    select * into o from outreach_mcp where unsub_token = p_token;
    if o.entity_id is null then return 0; end if;
    insert into outreach_suppress(value) values (lower(coalesce(o.contact_email, o.domain))) on conflict do nothing;
    insert into outreach_suppress(value) values (o.domain) on conflict do nothing;
    update outreach_mcp set status = 'unsubscribed' where unsub_token = p_token;
    return 1;
  end if;
  update page_followers set unsubscribed_at = now(), offers_opt_in = false
   where unsubscribed_at is null and (unsub_token = p_token or (p_all and email = v_email));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function unsubscribe_follow(uuid, boolean) from public;
grant execute on function unsubscribe_follow(uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Your daily view (private) + schedule
-- ---------------------------------------------------------------------
create or replace view v_outreach_new_mcp as
select o.created_at::date as day, e.name as server, 'https://electraindex.com/mcp/' || e.slug as page,
       o.domain, o.status, o.contact_email, o.skip_reason, o.sent_at
  from outreach_mcp o join entities e on e.id = o.entity_id;
revoke all on v_outreach_new_mcp from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname like 'electra-outreach-%';
select cron.schedule('electra-outreach-pick',  '30 5 * * *',      $job$ select outreach_pick(60); $job$);
select cron.schedule('electra-outreach-parse', '*/15 5-7 * * *',  $job$ select outreach_parse(); $job$);
select cron.schedule('electra-outreach-send',  '0 8 * * *',       $job$ select outreach_send(20); $job$);

-- Check: the 3 jobs are scheduled
select jobname, schedule from cron.job where jobname like 'electra-outreach-%' order by jobname;
