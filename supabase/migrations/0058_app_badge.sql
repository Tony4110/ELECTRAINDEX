-- ELECTRA INDEX — INSTALL_APP_BADGE : listing emails for AI apps now offer the "Listed on Electra Index" badge too
--  (agents and MCP servers already had it). Includes the rejection-reason update (INSTALL_REJECT_REASON), so it is
--  fine whether or not that file was run. Paste everything in Supabase > SQL Editor > Run. Re-runnable.

alter table submissions add column if not exists review_note text;

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
        '- New versions are tracked and shown on your page.' || chr(10) ||
        '- A status badge for your README: [![Electra Index](https://electraindex.com/api/badge/' || e.slug || ')](' || v_page || ')' || chr(10)
      else
        '- New versions and install instructions are tracked from the Official MCP Registry and shown on your page.' || chr(10) ||
        '- ' || e.name || ' appears on the use-case pages that match what it does.' || chr(10)
    end ||
    case when p_kind = 'welcome' then '- A monthly report of the visitors who clicked from Electra Index to your site.' || chr(10) else '' end ||
    chr(10) || 'Show your listing: announce it on LinkedIn in one click and add the free "Listed on Electra Index" badge to your website:' || chr(10) ||
    v_page || '#share' || chr(10) ||
    chr(10) || 'Something wrong or missing on your page? Just reply to this email.' || chr(10) ||
    case when p_unsub is not null then 'Stop these emails in one click: https://electraindex.com/unsubscribe?t=' || p_unsub || chr(10) else '' end;

  if (p_offers or p_kind = 'listed') and v_prof <> 'app' then   -- apps: no paid offer yet   -- one single listing email: everyone listed sees the offer that fits their product
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

select 'listing email updated (badge for apps)' as result;
