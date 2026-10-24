-- ELECTRA INDEX — INSTALL_PUBLISHER_EMAILS_2 : adds 'Show your listing' (LinkedIn post + badge) to publisher emails
-- Re-runnable. Paste everything into Supabase > SQL Editor > Run. NOTHING IS SENT by this file: the last query is a dry run.

-- =====================================================================
-- 0051 — Emails to publishers (agents and MCP servers)
--  One email per listing decision, adapted to the product:
--   * listed agent          -> page + what we track + Launch Spotlight offer
--   * listed local MCP      -> page + what we track + Launch Spotlight offer
--   * listed hosted MCP     -> page + live check + badge + Monitoring Pro for life offer
--   * not listed            -> polite decline with our concrete criteria (no offer)
--  Offer boxes:
--   * Publisher Program members (ticked the box): Monitoring Pro (hosted MCP)
--     or Launch Spotlight (agents, local MCP).
--   * Everyone else gets one single email about their listing, with the offer
--     that fits their product, and a clear line saying nothing else will be
--     sent without their consent.
--  Sent automatically when a submission becomes "listed" or "rejected",
--  and once to existing contacts with publisher_campaign(true) after a
--  dry run: select * from publisher_campaign(false);
--  Each (email, product) receives each kind of email at most once.
-- =====================================================================

alter table notify_log add column if not exists entity_id uuid;

-- generic sender with our own HTML (same Vault key, log and limits as send_email)
create or replace function send_email_html(p_kind text, p_to text, p_subject text, p_text text, p_html text,
                                           p_daily_cap int default 200, p_entity uuid default null)
returns boolean language plpgsql security definer set search_path = public, net, vault as $$
declare v_key text; rid bigint;
begin
  if (select count(*) from notify_log where kind = p_kind and created_at > now() - interval '1 day' and skipped is null) >= p_daily_cap then
    insert into notify_log(kind, subject, recipient, skipped, entity_id) values (p_kind, p_subject, p_to, 'daily limit', p_entity); return false;
  end if;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then v_key := null;
  end;
  if coalesce(v_key, '') = '' then
    insert into notify_log(kind, subject, recipient, skipped, entity_id) values (p_kind, p_subject, p_to, 'no resend_api_key in vault', p_entity); return false;
  end if;
  select net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('from', 'Tony Nelson, Electra Index <notifications@electraindex.com>',
                                  'to', jsonb_build_array(p_to), 'reply_to', 'contact@electraindex.com',
                                  'subject', left(p_subject, 200), 'text', p_text, 'html', p_html),
    timeout_milliseconds := 10000) into rid;
  insert into notify_log(kind, subject, recipient, request_id, entity_id) values (p_kind, p_subject, p_to, rid, p_entity);
  return true;
exception when others then
  insert into notify_log(kind, subject, recipient, skipped, entity_id) values (p_kind, p_subject, p_to, left(sqlerrm, 200), p_entity);
  return false;
end $$;
revoke execute on function send_email_html(text, text, text, text, text, int, uuid) from public, anon, authenticated;

create or replace function html_esc(p text) returns text language sql immutable as $$
  select replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

-- which offer fits this product
create or replace function publisher_profile(p_entity uuid) returns text language sql stable set search_path = public as $$
  select case when e.type = 'agent' then 'agent'
              when e.type = 'mcp_server' and live_check_url(e.id) is not null then 'mcp_hosted'
              when e.type = 'mcp_server' then 'mcp_local' end
    from entities e where e.id = p_entity
$$;

-- builds { subject, text, html } for one publisher email
--   p_kind: 'listed' (new listing), 'welcome' (joined the Publisher Program), 'rejected'
create or replace function publisher_message(p_kind text, p_entity uuid, p_name text default null, p_offers boolean default false,
                                             p_unsub uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  e record; v_prof text; v_page text; v_url text; l record;
  v_subject text; v_body text; v_after2 text; v_box_title text; v_box_lines text[]; v_cta text; v_cta_url text; v_after text := '';
  t text; h text; li text;
  v_sig_t text := chr(10) || 'Best regards,' || chr(10) || chr(10) || 'Tony Nelson' || chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com';
begin
  if p_kind = 'rejected' then
    v_subject := 'Your listing request on Electra Index' || coalesce(': ' || p_name, '');
    v_body := 'Hi,' || chr(10) || chr(10) ||
      'Thank you for submitting ' || coalesce(p_name, 'your product') || ' to Electra Index. We studied your website and pricing page carefully.' || chr(10) || chr(10) ||
      'Unfortunately we cannot list it for now. Electra Index lists AI agents and MCP servers that meet these criteria:' || chr(10) ||
      '1. It is an agent: it carries out a task or a workflow for the user (research, outreach, scheduling, editing, publishing...), not only content generation from a prompt.' || chr(10) ||
      '2. Public pricing: plans and prices are visible on the official website (or clearly stated as "on quote").' || chr(10) ||
      '3. An identifiable publisher: a company name and country, or a named team, on the website.' || chr(10) ||
      '4. A plus: an API or an MCP server, so that other software can use it.' || chr(10) || chr(10) ||
      'If your product changes on one of these points, simply submit it again at https://electraindex.com/submit and we will review it with pleasure.' || chr(10);
    return jsonb_build_object('subject', v_subject, 'text', v_body || v_sig_t, 'html', email_html(v_body || v_sig_t));
  end if;

  select id, type, slug, name into e from entities where id = p_entity;
  if e.id is null then return null; end if;
  v_prof := publisher_profile(e.id);
  v_page := 'https://electraindex.com/' || case e.type when 'agent' then 'agents/' else 'mcp/' end || e.slug;
  v_url := live_check_url(e.id);
  select * into l from mcp_live_status where entity_id = e.id;

  v_subject := case p_kind when 'welcome' then 'Welcome to the Electra Index Publisher Program: ' || e.name
                            else e.name || ' is now listed on Electra Index' end;
  v_body := 'Hi,' || chr(10) || chr(10) ||
    case p_kind when 'welcome' then 'Thank you for joining the Electra Index Publisher Program for ' || e.name || '. Your page:'
                else 'Thank you for submitting ' || e.name || '. It is now listed on Electra Index:' end || chr(10) ||
    v_page || chr(10) || chr(10) || 'What we do for you, for free:' || chr(10) ||
    case v_prof
      when 'agent' then
        '- Our robots follow your official pricing page and record every change, with its date.' || chr(10) ||
        '- ' || e.name || ' appears in the rankings of the tasks it covers, scored only on public, verifiable data.' || chr(10)
      when 'mcp_hosted' then
        '- Our robot connects to ' || v_url || ' like an AI assistant would' ||
          coalesce(' (last result: ' || case when l.status = 'online' then 'online' || coalesce(', ' || l.tool_count || ' tools listed', '')
                                             when l.status = 'auth_required' then 'reachable, asks for a key' else 'not answering' end || ')', '') || '.' || chr(10) ||
        '- New versions are tracked and shown on your page.' || chr(10) ||
        '- A status badge for your README: [![Electra Index](https://electraindex.com/api/badge/' || e.slug || ')](' || v_page || ')' || chr(10)
      else
        '- New versions and install instructions are tracked from the Official MCP Registry and shown on your page.' || chr(10) ||
        '- ' || e.name || ' appears on the use-case pages that match what it does.' || chr(10)
    end ||
    case when p_kind = 'welcome' then '- A monthly report of the visitors who clicked from Electra Index to your site.' || chr(10) else '' end ||
    chr(10) || 'Show your listing: announce it on LinkedIn in one click and add the Electra Index badge to your site:' || chr(10) ||
    v_page || '#share' || chr(10) ||
    chr(10) || 'Something wrong or missing on your page? Just reply to this email.' || chr(10) ||
    case when p_unsub is not null then 'Stop these emails in one click: https://electraindex.com/unsubscribe?t=' || p_unsub || chr(10) else '' end;

  if p_offers or p_kind = 'listed' then   -- one single listing email: everyone listed sees the offer that fits their product
    if v_prof = 'mcp_hosted' then
      v_box_title := 'Monitoring Pro for life';
      v_box_lines := array['<b>$39.99 once</b>, instead of $9.99/month ($120 a year). No subscription.',
                           'Your endpoint checked every 30 minutes, like an AI assistant would',
                           'An email within the hour if it stops answering, and when it is back',
                           'A private 90-day report and a badge with your answer rate'];
      v_cta := 'Get the launch offer'; v_cta_url := 'https://electraindex.com/monitor?server=' || e.slug || '#start';
      v_after := case when p_offers then 'Prefer visibility? Our Launch Spotlight puts ' || e.name || ' on the pages where people compare MCP servers: $14.99 for 60 days, https://electraindex.com/spotlight?product=' || e.slug || '#preview' else '' end;
    else
      v_box_title := 'Launch Spotlight';
      v_box_lines := array['<b>$14.99 once</b> for 60 days, instead of $69.99. No subscription.',
                           'A Sponsored card on the pages where people compare ' || case when v_prof = 'agent' then 'AI agents' else 'MCP servers' end || ' like yours',
                           'A mention in the weekly MCP &amp; Agent Pulse',
                           'Real-visitor click reports. No click in 60 days? The next 60 days are free.'];
      v_cta := 'See where ' || e.name || ' would appear'; v_cta_url := 'https://electraindex.com/spotlight?product=' || e.slug || '#preview';
    end if;
  end if;

  -- plain text
  t := v_body;
  if v_box_title is not null then
    t := t || chr(10) || '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || chr(10) || '★ EXCLUSIVE LAUNCH OFFER — ' || upper(v_box_title) || ' ★' || chr(10) || chr(10) ||
         regexp_replace(replace(v_box_lines[1], '&amp;', '&'), '<[^>]+>', '', 'g') || chr(10) || chr(10) ||
         (select string_agg('• ' || replace(x, '&amp;', '&'), chr(10)) from unnest(v_box_lines[2:]) x) || chr(10) || chr(10) ||
         '→ ' || v_cta || ': ' || v_cta_url || chr(10) || '━━━━━━━━━━━━━━━━━━━━━━━━━━━━' || chr(10) ||
         case when v_after <> '' then chr(10) || v_after || chr(10) else '' end;
  end if;
  if not p_offers then
    v_after2 := 'This is the only email you will receive about your listing. We will not send you offers unless you join our free Publisher Program: https://electraindex.com/pricing';
    t := t || chr(10) || v_after2 || chr(10);
  end if;
  t := t || v_sig_t;

  -- HTML: same text, with the offer as a highlighted box and a button
  h := '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#121816;max-width:580px">' ||
       replace(regexp_replace(html_esc(v_body), '(https://[^\s<]+)', '<a href="\1" style="color:#1F3FD1">\1</a>', 'g'), chr(10), '<br>');
  if v_box_title is not null then
    select string_agg('<li style="margin:4px 0">' || x || '</li>', '') into li from unnest(v_box_lines[2:]) x;
    h := h || '<div style="margin:22px 0;padding:18px 20px;border-radius:12px;background:#FEF3D6;border:2px solid #F5B82E">' ||
         '<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#16753A;color:#fff;font:700 12px/1.2 monospace;letter-spacing:1px">EXCLUSIVE LAUNCH OFFER</span>' ||
         '<p style="margin:10px 0 4px;font-size:19px;font-weight:700">' || html_esc(v_box_title) || '</p>' ||
         '<p style="margin:0 0 8px">' || v_box_lines[1] || '</p>' ||
         '<ul style="margin:0 0 14px;padding-left:20px">' || li || '</ul>' ||
         '<a href="' || v_cta_url || '" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#F5B82E;color:#121816;font-weight:700;text-decoration:none">' || html_esc(v_cta) || ' →</a>' ||
         '</div>';
    if v_after <> '' then
      h := h || '<p style="font-size:14px;color:#4a5550">' || regexp_replace(html_esc(v_after), '(https://[^\s<]+)', '<a href="\1" style="color:#1F3FD1">\1</a>', 'g') || '</p>';
    end if;
  end if;
  if not p_offers then
    h := h || '<p style="font-size:13px;color:#6b7570">' || regexp_replace(html_esc(v_after2), '(https://[^\s<]+)', '<a href="\1" style="color:#1F3FD1">\1</a>', 'g') || '</p>';
  end if;
  h := h || replace(html_esc(v_sig_t), chr(10), '<br>') || '</div>';
  return jsonb_build_object('subject', v_subject, 'text', t, 'html', h, 'profile', v_prof, 'offer', v_box_title);
end $$;

-- send one publisher email, at most once per (kind, email, product)
create or replace function publisher_send(p_kind text, p_email text, p_entity uuid, p_name text default null, p_offers boolean default false,
                                          p_unsub uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare m jsonb; v_kind text := 'publisher_' || p_kind;
begin
  if coalesce(p_email, '') = '' then return 'no email'; end if;
  if exists (select 1 from notify_log where kind = v_kind and lower(recipient) = lower(p_email)
              and (entity_id is not distinct from p_entity) and (p_entity is not null or subject ilike '%' || coalesce(p_name, '') || '%')
              and skipped is null) then
    return 'already sent';
  end if;
  m := publisher_message(p_kind, p_entity, p_name, p_offers, p_unsub);
  if m is null then return 'no product'; end if;
  perform send_email_html(v_kind, p_email, m->>'subject', m->>'text', m->>'html', 200, p_entity);
  return 'sent';
end $$;
revoke execute on function publisher_send(text, text, uuid, text, boolean, uuid) from public, anon, authenticated;

-- automatic: a submission is listed (or accepted as a duplicate of a listed product) or rejected
create or replace function submissions_publisher_email() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status in ('listed','duplicate') and new.entity_id is not null then
    perform publisher_send('listed', new.contact_email, new.entity_id, new.name, new.offers_opt_in);
  elsif new.status = 'rejected' then
    perform publisher_send('rejected', new.contact_email, null, new.name, false);
  end if;
  return null;
exception when others then return null;   -- never block a review because of an email
end $$;
drop trigger if exists trg_submissions_publisher_email on submissions;
create trigger trg_submissions_publisher_email after update of status on submissions
  for each row execute function submissions_publisher_email();
revoke execute on function submissions_publisher_email() from public, anon, authenticated;

-- automatic: a publisher joins the Publisher Program from a page (Follow box, "I built it" + offers)
create or replace function followers_publisher_email() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'publisher' and new.offers_opt_in and new.unsubscribed_at is null
     and (tg_op = 'INSERT' or not coalesce(old.offers_opt_in, false)) then
    perform publisher_send('welcome', new.email, new.entity_id, null, true, new.unsub_token);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists trg_followers_publisher_email on page_followers;
create trigger trg_followers_publisher_email after insert or update of offers_opt_in on page_followers
  for each row execute function followers_publisher_email();
revoke execute on function followers_publisher_email() from public, anon, authenticated;

-- publishers who join the program get the welcome email instead of the plain confirmation
create or replace function follow_confirm() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if tg_op = 'UPDATE' and old.unsubscribed_at is null then return null; end if;   -- already active: nothing new
  if new.role = 'publisher' and new.offers_opt_in then return null; end if;   -- the Publisher Program welcome email (0051) replaces it
  if (select count(*) from notify_log where kind = 'follow_confirm' and recipient = new.email and created_at > now() - interval '1 day') >= 5 then
    return null;
  end if;
  select name, type into e from entities where id = new.entity_id;
  perform send_email('follow_confirm', new.email,
    'You are following ' || e.name || ' on Electra Index',
    'Hi,' || chr(10) || chr(10) ||
    'You will get an email when our robots detect a change on ' || e.name || ':' || chr(10) ||
    case when e.type = 'agent' then '- a price or plan change on its official pricing page' || chr(10)
         else '- it stops answering our live check, or comes back online' || chr(10) || '- a new version is published' || chr(10) end ||
    chr(10) || 'Page: ' || page_url(new.entity_id) || chr(10) ||
    case when new.offers_opt_in then chr(10) || 'You also joined the free Publisher Program. Thank you!' || chr(10) else '' end ||
    chr(10) || 'Did not ask for this? Unsubscribe in one click:' || chr(10) ||
    'https://electraindex.com/unsubscribe?t=' || new.unsub_token || chr(10) || chr(10) ||
    'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com', 200, new.unsub_token);
  return null;
end $$;

-- one-off: everyone we already have. Dry run first: select * from publisher_campaign(false);
drop function if exists publisher_campaign(boolean);
create or replace function publisher_campaign(p_send boolean default false, p_max int default 8)
returns table(email text, product text, kind text, profile text, offer text, result text)
language plpgsql security definer set search_path = public as $$
declare r record; v_res text; m jsonb; n_sent int := 0;
begin
  for r in
    with c as (
      select s.contact_email as email, s.entity_id, s.name, s.offers_opt_in as offers,
             case when s.status in ('listed','duplicate') then 'listed' when s.status = 'rejected' then 'rejected' end as k, s.created_at,
             (select f.unsub_token from page_followers f where f.entity_id = s.entity_id and lower(f.email) = lower(s.contact_email) and f.unsubscribed_at is null limit 1) as unsub
        from submissions s
       where s.status in ('listed','duplicate','rejected') and (s.status = 'rejected' or s.entity_id is not null)
         and not exists (select 1 from page_followers f where lower(f.email) = lower(s.contact_email) and f.unsubscribed_at is not null)
      union all
      select f.email, f.entity_id, null, f.offers_opt_in, 'welcome', f.created_at, f.unsub_token
        from page_followers f
       where f.role = 'publisher' and f.offers_opt_in and f.unsubscribed_at is null
    )
    select distinct on (lower(c.email), coalesce(c.entity_id::text, c.name)) c.*
      from c order by lower(c.email), coalesce(c.entity_id::text, c.name), c.offers desc, c.created_at
  loop
    m := case when r.k = 'rejected' then null else publisher_message(r.k, r.entity_id, r.name, r.offers) end;
    if p_send and n_sent >= p_max then
      v_res := 'next batch';   -- Resend accepts 10 emails per second: run again for the next batch
    elsif p_send then
      v_res := publisher_send(r.k, r.email, case when r.k = 'rejected' then null else r.entity_id end, r.name, r.offers, r.unsub);
      if v_res = 'sent' then n_sent := n_sent + 1; end if;
    elsif exists (select 1 from notify_log n where n.kind = 'publisher_' || r.k and lower(n.recipient) = lower(r.email)
                   and (n.entity_id is not distinct from case when r.k = 'rejected' then null else r.entity_id end) and n.skipped is null) then
      v_res := 'already sent';
    else
      v_res := 'would send';
    end if;
    email := r.email; product := coalesce(r.name, (select name from entities where id = r.entity_id)); kind := r.k;
    profile := coalesce(m->>'profile', '-'); offer := coalesce(m->>'offer', 'none'); result := v_res;
    return next;
  end loop;
end $$;
revoke execute on function publisher_campaign(boolean, int) from public, anon, authenticated;

-- preview any email in the SQL Editor:
--   select publisher_message('listed', (select id from entities where slug = 'bottally' and type = 'agent'), null, true)->>'text';


-- ---------------------------------------------------------------------
-- "Show your listing": one short, non-commercial email to Publisher Program members
-- (LinkedIn post in one click + badge). Dry run: select * from publisher_share_campaign(false);
-- ---------------------------------------------------------------------
create or replace function publisher_share_message(p_entity uuid) returns jsonb language plpgsql stable set search_path = public as $$
declare e record; v_page text; v_badge text; t text; h text; v_post text; v_li text;
begin
  select id, type, slug, name into e from entities where id = p_entity;
  if e.id is null then return null; end if;
  v_page := 'https://electraindex.com/' || case e.type when 'agent' then 'agents/' else 'mcp/' end || e.slug;
  v_badge := 'https://electraindex.com/api/badge/' || case e.type when 'agent' then 'agent/' else '' end || e.slug;
  v_post := e.name || ' is now listed on Electra Index, the independent index of ' ||
            case e.type when 'agent' then 'AI agents with verified prices and rankings. See how we compare: ' else 'MCP servers, tested live and ranked by use case. See it here: ' end ||
            v_page || case e.type when 'agent' then ' #AIagents' else ' #MCP #AIagents' end;
  v_li := 'https://www.linkedin.com/feed/?shareActive=true&text=' || replace(replace(replace(replace(replace(replace(v_post, '%', '%25'), ' ', '%20'), '#', '%23'), ':', '%3A'), '/', '%2F'), ',', '%2C');
  t := 'Hi,' || chr(10) || chr(10) ||
       'A quick one about your page on Electra Index: ' || v_page || chr(10) || chr(10) ||
       'An independent listing builds trust with your buyers. If it helps you, here is everything to show it:' || chr(10) || chr(10) ||
       '1. Announce it on LinkedIn in one click (the post is ready, edit it as you like):' || chr(10) || v_page || '#share' || chr(10) || chr(10) ||
       '2. Add the badge to your website or README (it links to your page):' || chr(10) ||
       '<a href="' || v_page || '"><img src="' || v_badge || '" alt="Listed on Electra Index"></a>' || chr(10) || chr(10) ||
       'Nothing to buy, nothing else will follow from this email.' || chr(10) || chr(10) ||
       'Best regards,' || chr(10) || chr(10) || 'Tony Nelson' || chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com';
  h := '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#121816;max-width:580px">' ||
       'Hi,<br><br>A quick one about your page on Electra Index: <a href="' || v_page || '" style="color:#1F3FD1">' || html_esc(v_page) || '</a><br><br>' ||
       'An independent listing builds trust with your buyers. If it helps you, here is everything to show it:' ||
       '<p style="margin:18px 0"><a href="' || v_li || '" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#0A66C2;color:#fff;font-weight:700;text-decoration:none">Announce it on LinkedIn →</a></p>' ||
       '<p style="margin:0 0 6px">Add the badge to your website or README (it links to your page):</p>' ||
       '<p style="margin:0 0 6px"><a href="' || v_page || '"><img src="' || v_badge || '" alt="Listed on Electra Index" height="20"></a></p>' ||
       '<p style="margin:0 0 16px;font:12px monospace;background:#F3F4F1;padding:8px 10px;border-radius:6px;word-break:break-all">' ||
       html_esc('<a href="' || v_page || '"><img src="' || v_badge || '" alt="Listed on Electra Index"></a>') || '</p>' ||
       '<p style="font-size:13px;color:#6b7570">Nothing to buy, nothing else will follow from this email.</p>' ||
       'Best regards,<br><br>Tony Nelson<br>Electra Index, published by Dreamotion OÜ<br>Estonia &amp; Switzerland<br>contact@electraindex.com</div>';
  return jsonb_build_object('subject', 'Show your listing: ' || e.name || ' on Electra Index', 'text', t, 'html', h);
end $$;

create or replace function publisher_share_campaign(p_send boolean default false, p_max int default 8)
returns table(email text, product text, result text) language plpgsql security definer set search_path = public as $$
declare r record; m jsonb; n int := 0;
begin
  for r in
    select distinct on (lower(x.email), x.entity_id) x.email, x.entity_id
      -- Publisher Program members only: the others were promised a single email about their listing
      from (select s.contact_email as email, s.entity_id from submissions s where s.status in ('listed','duplicate') and s.entity_id is not null and s.offers_opt_in
            union all
            select f.email, f.entity_id from page_followers f where f.role = 'publisher' and f.offers_opt_in and f.unsubscribed_at is null) x
     where not exists (select 1 from page_followers u where lower(u.email) = lower(x.email) and u.unsubscribed_at is not null)
     order by lower(x.email), x.entity_id
  loop
    email := r.email; product := (select name from entities where id = r.entity_id);
    if exists (select 1 from notify_log l where l.kind = 'publisher_share' and lower(l.recipient) = lower(r.email) and l.entity_id = r.entity_id and l.skipped is null) then
      result := 'already sent';
    elsif not p_send then
      result := 'would send';
    elsif n >= p_max then
      result := 'next batch';
    else
      m := publisher_share_message(r.entity_id);
      perform send_email_html('publisher_share', r.email, m->>'subject', m->>'text', m->>'html', 200, r.entity_id);
      n := n + 1; result := 'sent';
    end if;
    return next;
  end loop;
end $$;
revoke execute on function publisher_share_campaign(boolean, int) from public, anon, authenticated;

-- dry run of the share email (Publisher Program members only)
select * from publisher_share_campaign(false);
