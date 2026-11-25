-- ELECTRA INDEX — INSTALL_VERIFIED_EMAILS (0071) : Electra Verified in the publisher emails (validated by Ami Chat on 25 Nov 2026)
--  * daily email to new hosted MCP servers (outreach_message): badge + "free with the badge: Electra Verified";
--  * "... is now listed" email (publisher_message): same Verified block for hosted MCP servers,
--    and the Monitoring Pro offer now says $29.99 a year (founding price), no more "for life".
--  * badge code in both emails: rel="nofollow" (Ami Chat, 21 Nov 2026).
--  Nothing else changes (who receives the emails, when, how many).

create or replace function publisher_message(p_kind text, p_entity uuid, p_name text default null, p_offers boolean default false,
                                             p_unsub uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  e record; v_prof text; v_page text; v_url text; l record;
  v_subject text; v_body text; v_after2 text; v_box_title text; v_box_lines text[]; v_cta text; v_cta_url text; v_after text := '';
  t text; h text; li text; v_bseg text; v_burl text; v_code text; v_md text; v_btxt text; v_ver_t text := ''; v_ver_h text := '';
  v_sig_t text := chr(10) || 'Best regards,' || chr(10) || chr(10) || 'Tony Nelson' || chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com';
begin
  if p_kind = 'rejected' then
    v_subject := 'Your listing request on Electra Index' || coalesce(': ' || p_name, '');
    v_body := 'Hi,' || chr(10) || chr(10) ||
      'Thank you for submitting ' || coalesce(p_name, 'your product') || ' to Electra Index. We studied your website and pricing page carefully.' || chr(10) || chr(10) ||
      'Unfortunately we cannot list it for now. Electra Index lists AI agents, MCP servers and AI apps that meet these criteria:' || chr(10) ||
      '1. A clear product: an AI agent that carries out a task or a workflow for the user, an MCP server, or an AI app for the public (coaching, learning, creativity, wellbeing, accessibility...).' || chr(10) ||
      '2. Public pricing: plans and prices are visible on the official website or app store listing (or clearly stated as free or "on quote").' || chr(10) ||
      '3. An identifiable publisher: a company name and country, or a named team, on the website.' || chr(10) ||
      '4. A privacy policy on the website when the product asks for personal data or conversations.' || chr(10) ||
      '5. A product people can use today, not only a waitlist or a pre-launch page.' || chr(10) || chr(10) ||
      coalesce('What we found on your website: ' || (select s.review_note from submissions s
                  where s.status = 'rejected' and s.review_note is not null and s.name is not distinct from p_name
                  order by s.reviewed_at desc nulls last limit 1) || chr(10) || chr(10), '') ||
      'This is not a judgement on the quality of your work. As soon as your product meets these points, simply submit it again at https://electraindex.com/submit and we will review it with pleasure.' || chr(10);
    return jsonb_build_object('subject', v_subject, 'text', v_body || v_sig_t, 'html', email_html(v_body || v_sig_t));
  end if;

  select id, type, slug, name into e from entities where id = p_entity;
  if e.id is null then return null; end if;
  v_prof := publisher_profile(e.id);
  v_page := 'https://electraindex.com/' || case e.type when 'agent' then 'agents/' when 'app' then 'apps/' else 'mcp/' end || e.slug;
  v_url := live_check_url(e.id);
  v_bseg := case e.type when 'agent' then 'agent/' when 'app' then 'app/' else '' end;
  v_burl := v_page || '?utm_source=badge&utm_medium=email&utm_campaign=listing';
  v_code := '<a href="' || v_burl || '" rel="nofollow"><img src="https://electraindex.com/api/badge/' || v_bseg || e.slug || '/card" width="260" height="72" alt="Listed on Electra Index"></a>';
  v_md := '[![Listed on Electra Index](https://electraindex.com/api/badge/' || v_bseg || e.slug || ')](' || v_burl || ')';
  v_btxt := 'ADD THE FREE "LISTED ON ELECTRA INDEX" BADGE TO YOUR WEBSITE' || chr(10) ||
            'It shows your visitors that ' || e.name || case when e.type = 'mcp_server' then ' is independently listed and tracked' else ' is independently listed and its prices are verified' end || '. Paste this code in your website footer (30 seconds):' || chr(10) || chr(10) ||
            v_code || chr(10) || chr(10) ||
            case when e.type = 'mcp_server' then 'For your GitHub README:' || chr(10) || v_md || chr(10) || chr(10) else '' end ||
            'Preview and one-click copy on your page: ' || v_page || '#share' || chr(10);
  if publisher_profile(e.id) = 'mcp_hosted' then
    v_ver_t := chr(10) || 'FREE WITH THE BADGE: ELECTRA VERIFIED' || chr(10) ||
               'While the badge is on your site or README, we test ' || e.name || ' every 12 hours, email you when it stops answering, ' ||
               'and the badge shows its 30-day availability. Activate it in 1 minute: https://electraindex.com/verified?server=' || e.slug || chr(10);
    v_ver_h := '<p style="margin:14px 0 6px;padding-top:12px;border-top:1px solid #c7d0f5;font-weight:700;color:#1F3FD1">Free with the badge: Electra Verified</p>' ||
               '<p style="margin:0 0 10px">While the badge is on your site or README, we test ' || html_esc(e.name) || ' every 12 hours, email you when it stops answering, and the badge shows its 30-day availability.</p>' ||
               '<a href="https://electraindex.com/verified?server=' || e.slug || '#start" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#16753A;color:#fff;font-weight:700;text-decoration:none">Activate Electra Verified, free →</a>';
  end if;
  select * into l from mcp_live_status where entity_id = e.id;

  v_subject := case p_kind when 'welcome' then 'Welcome to the Electra Index Publisher Program: ' || e.name
                            else e.name || ' is now listed on Electra Index' end;
  v_body := 'Hi,' || chr(10) || chr(10) ||
    case p_kind when 'welcome' then 'Thank you for joining the Electra Index Publisher Program for ' || e.name || '. Your page:'
                else 'Thank you for submitting ' || e.name || '. It is now listed on Electra Index:' end || chr(10) ||
    v_page || chr(10) || chr(10) || 'What we do for you, for free:' || chr(10) ||
    case v_prof
      when 'app' then
        '- Your prices are read on your official pricing page and every change is recorded, with its date.' || chr(10) ||
        '- ' || e.name || ' appears in the AI apps section, next to the apps people compare it with.' || chr(10)
      when 'agent' then
        '- Our robots follow your official pricing page and record every change, with its date.' || chr(10) ||
        '- ' || e.name || ' appears in the rankings of the tasks it covers, scored only on public, verifiable data.' || chr(10)
      when 'mcp_hosted' then
        '- Our robot connects to ' || v_url || ' like an AI assistant would' ||
          coalesce(' (last result: ' || case when l.status = 'online' then 'online' || coalesce(', ' || l.tool_count || ' tools listed', '')
                                             when l.status = 'auth_required' then 'reachable, asks for a key' else 'not answering' end || ')', '') || '.' || chr(10) ||
        '- New versions are tracked and shown on your page.' || chr(10)
      else
        '- New versions and install instructions are tracked from the Official MCP Registry and shown on your page.' || chr(10) ||
        '- ' || e.name || ' appears on the use-case pages that match what it does.' || chr(10)
    end ||
    case when p_kind = 'welcome' then '- A monthly report of the visitors who clicked from Electra Index to your site.' || chr(10) else '' end ||
    chr(10) || 'You can also announce your listing on LinkedIn in one click from your page.' || chr(10) ||
    chr(10) || 'Something wrong or missing on your page? Just reply to this email.' || chr(10) ||
    case when p_unsub is not null then 'Stop these emails in one click: https://electraindex.com/unsubscribe?t=' || p_unsub || chr(10) else '' end;

  if (p_offers or p_kind = 'listed') and v_prof <> 'app' then   -- apps: no paid offer yet   -- one single listing email: everyone listed sees the offer that fits their product
    if v_prof = 'mcp_hosted' then
      v_box_title := 'Monitoring Pro, founding price';
      v_box_lines := array['<b>$29.99 a year</b>, instead of $9.99/month ($120 a year). Cancel anytime.',
                           'Your endpoint checked every 30 minutes, like an AI assistant would',
                           'An email within the hour if it stops answering, and when it is back',
                           'A private 90-day report and a badge with your answer rate'];
      v_cta := 'Get the founding price'; v_cta_url := 'https://electraindex.com/monitor?server=' || e.slug || '#start';
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

  -- plain text: the badge comes right after the page link, before everything else
  t := replace(v_body, v_page || chr(10) || chr(10) || 'What we do for you, for free:',
               v_page || chr(10) || chr(10) || v_btxt || v_ver_t || chr(10) || 'What we do for you, for free:');
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
  h := replace(h, 'What we do for you, for free:',
       '<div style="margin:18px 0 22px;padding:18px 20px;border-radius:12px;background:#EEF2FF;border:2px solid #1F3FD1">' ||
       '<p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1F3FD1">Add the free &quot;Listed on Electra Index&quot; badge to your website</p>' ||
       '<p style="margin:0 0 12px">It shows your visitors that ' || html_esc(e.name) || case when e.type = 'mcp_server' then ' is independently listed and tracked' else ' is independently listed and its prices are verified' end || '. Paste this code in your website footer (30 seconds):</p>' ||
       '<p style="margin:0 0 10px"><img src="https://electraindex.com/api/badge/' || v_bseg || e.slug || '/card" width="260" height="72" alt="Listed on Electra Index"></p>' ||
       '<pre style="margin:0 0 10px;padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #c7d0f5;font:12px/1.45 monospace;white-space:pre-wrap;word-break:break-all">' || html_esc(v_code) || '</pre>' ||
       case when e.type = 'mcp_server' then '<p style="margin:0 0 4px;font-size:13px">For your GitHub README:</p><pre style="margin:0 0 10px;padding:10px 12px;border-radius:8px;background:#fff;border:1px solid #c7d0f5;font:12px/1.45 monospace;white-space:pre-wrap;word-break:break-all">' || html_esc(v_md) || '</pre>' else '' end ||
       '<a href="' || v_page || '#share" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#1F3FD1;color:#fff;font-weight:700;text-decoration:none">Preview and copy it on your page →</a>' ||
       v_ver_h ||
       '</div>What we do for you, for free:');
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
  v_code := '<a href="' || v_burl || '" rel="nofollow"><img src="https://electraindex.com/api/badge/' || e.slug || '/card" width="260" height="72" alt="Listed on Electra Index"></a>';
  v_subject := e.name || ' is independently listed and tested on Electra Index';

  t1 := 'Hi ' || e.name || ' team,' || chr(10) || chr(10) ||
        'Good news: ' || e.name || ' is now listed on Electra Index, the independent index of the agent economy that tracks more than ' || v_total || ' MCP servers.' || chr(10) || chr(10) ||
        'Your page: ' || v_page || chr(10) || chr(10) ||
        'We don''t just list your server, we test it. Our robot connects to ' || coalesce(v_url, 'your endpoint') || ' the way an AI assistant would. Last result: ' || v_live || '.' || chr(10) ||
        'Listings on Electra Index are never paid for: ' || e.name || ' is there because it is live and verifiable.' || chr(10);
  t2 := 'Need more? Monitoring Pro checks it every 30 minutes and emails you within the hour ($29.99 a year, founding price): https://electraindex.com/monitor?server=' || e.slug || chr(10) || chr(10) ||
        'Best regards,' || chr(10) || chr(10) ||
        'Tony Nelson' || chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com' || chr(10) || chr(10) ||
        'You are receiving this one-time email because ' || e.name || ' is published in the Official MCP Registry and your address is listed on your website. We will not email you again. Unsubscribe: https://electraindex.com/unsubscribe?t=' || p_unsub || chr(10);

  v_text := t1 || chr(10) ||
            'SHOW IT TO YOUR USERS: ADD YOUR FREE BADGE' || chr(10) ||
            'Developers and AI teams use Electra Index to choose which MCP servers they can trust. The badge tells your visitors that ' || e.name || ' is independently listed and tested. Paste this code in your website footer or README (30 seconds):' || chr(10) || chr(10) ||
            v_code || chr(10) || chr(10) ||
            'Copy it in one click, or announce it on LinkedIn in one click: ' || v_page || '#share' || chr(10) || chr(10) ||
            'FREE WITH THE BADGE: ELECTRA VERIFIED' || chr(10) ||
            'While the badge is on your site or README, we test ' || e.name || ' every 12 hours, email you when it stops answering, and the badge shows its 30-day availability. Activate it in 1 minute: https://electraindex.com/verified?server=' || e.slug || chr(10) || chr(10) || t2;

  v_html := email_html(t1) ||
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:18px 0;padding:18px;border:1px solid #C9D4FF;border-radius:10px;background:#F3F6FF;color:#121816">' ||
      '<div style="font-size:15px;font-weight:700;margin-bottom:6px">Show it to your users: add your free badge</div>' ||
      '<div style="font-size:14px;line-height:1.5;margin-bottom:12px">Developers and AI teams use Electra Index to choose which MCP servers they can trust. The badge tells your visitors that ' || html_esc(e.name) || ' is independently listed and tested.</div>' ||
      v_code ||
      '<div style="margin-top:14px"><a href="' || v_page || '#share" style="display:inline-block;background:#1F3FD1;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 16px;border-radius:8px">Copy your badge code in one click</a></div>' ||
      '<div style="font-size:13px;color:#4A5552;margin-top:8px">Website footer or GitHub README, 30 seconds. Or announce it on LinkedIn in one click from the same page.</div>' ||
      '<div style="font-size:15px;font-weight:700;margin:16px 0 6px;padding-top:12px;border-top:1px solid #C9D4FF;color:#16753A">Free with the badge: Electra Verified</div>' ||
      '<div style="font-size:14px;line-height:1.5;margin-bottom:12px">While the badge is on your site or README, we test ' || html_esc(e.name) || ' every 12 hours, email you when it stops answering, and the badge shows its 30-day availability.</div>' ||
      '<a href="https://electraindex.com/verified?server=' || e.slug || '#start" style="display:inline-block;background:#16753A;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 16px;border-radius:8px">Activate Electra Verified, free</a>' ||
    '</div>' ||
    email_html(t2);
  return jsonb_build_object('subject', v_subject, 'text', v_text, 'html', v_html);
end $$;
-- Paste everything in Supabase > SQL Editor > Run. Nothing is sent by this file.

-- check: preview of both emails for a hosted MCP server (nothing is sent)
with s as (select e.id from entities e join mcp_live_status l on l.entity_id = e.id
            where e.type = 'mcp_server' and e.is_published and live_check_url(e.id) is not null order by l.checked_at desc limit 1)
select 'listed email: Verified block' as check_name, (position('ELECTRA VERIFIED' in publisher_message('listed', s.id)->>'text') > 0)::text as result from s
union all select 'listed email: offer', publisher_message('listed', s.id)->>'offer' from s
union all select 'listed email: old "for life" text left', (position('for life' in publisher_message('listed', s.id)->>'text') > 0)::text from s
union all select 'new-server email: Verified block', (position('ELECTRA VERIFIED' in outreach_message(s.id, gen_random_uuid())->>'text') > 0)::text from s
union all select 'badge code nofollow', (position('rel="nofollow"' in outreach_message(s.id, gen_random_uuid())->>'text') > 0)::text from s;
