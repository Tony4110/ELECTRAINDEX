-- =====================================================================
-- 0055 — AI apps: a separate section for consumer AI apps
--  * New entity type "app" (/apps). Apps never enter the agent, task or
--    MCP rankings: they have their own pages, grouped by app theme.
--  * Same trust rules as everywhere: identifiable publisher, public price,
--    and a privacy policy when the app asks for personal data.
--  * "List your agent" accepts kind = 'app'; listing emails link to /apps/.
-- =====================================================================
insert into entity_types(code,label,plural,url_prefix,is_listing,sort_order) values
('app','AI app','AI apps','/apps',true,97)
on conflict (code) do nothing;

-- submissions: a third kind
alter table submissions drop constraint if exists submissions_kind_check;
alter table submissions add constraint submissions_kind_check check (kind in ('agent','tool','app'));

-- triage: a known website is a duplicate, whatever its section
create or replace function submissions_triage() returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select e.id into v_id from entities e
   where e.type in ('agent','mcp_server','app') and e.is_published
     and host_of(coalesce(e.website, e.attributes->'website.url'->>'value')) = host_of(new.website)
   order by (e.type = case new.kind when 'tool' then 'mcp_server' when 'app' then 'app' else 'agent' end) desc, e.first_seen_at
   limit 1;
  if v_id is not null then
    update submissions set status = 'duplicate', entity_id = v_id, reviewed_at = now() where id = new.id;
  end if;
  return null;
end $$;
revoke execute on function submissions_triage() from public, anon, authenticated;

-- one researched app -> entity, publisher, facts, price plans (history kept)
create or replace function ingest_app(p jsonb) returns uuid language plpgsql as $$
declare
  v_id uuid; v_co uuid; pl jsonb; v_started timestamptz := clock_timestamp();
  v_plan text; v_billing text; v_amount numeric; v_currency text; v_interval text; v_seen text[] := '{}';
  v_ev evidence_level := case when coalesce((p->>'pricing_verified')::boolean, true) then 'observed' else 'declared' end;
begin
  if p->>'name' is null or p->>'website' is null then return null; end if;
  if p->>'theme' not in ('coaching','wellbeing','learning','creativity','accessibility','entertainment') then
    raise exception 'unknown app theme: %', p->>'theme';
  end if;
  v_id := resolve_entity('app', p->>'name', jsonb_build_array(jsonb_build_object('type','domain','value', p->>'website')),
                         'SRC-049', p->>'website', left(p->>'short_description', 300));
  update entities set status = 'active', is_published = true, confidence = 'medium', last_seen_at = now(),
         website = coalesce(website, p->>'website'),
         short_description = coalesce(short_description, left(p->>'short_description', 300))
   where id = v_id;

  if coalesce(p->>'company','') <> '' then
    v_co := resolve_entity('company', p->>'company', jsonb_build_array(jsonb_build_object('type','name','value', p->>'company')), 'SRC-049', p->>'website', null);
    update entities set status = 'active', is_published = true where id = v_co;
    perform link(v_id, 'made_by', v_co, 'declared', 'SRC-049', 'high');
  end if;

  perform obs_if(v_id, 'website.url',       to_jsonb(p->>'website'),     'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'pricing.url',       to_jsonb(p->>'pricing_url'), 'declared', 'SRC-049', p->>'pricing_url');
  perform obs_if(v_id, 'app.theme',         to_jsonb(p->>'theme'),       'derived',  'SRC-000', p->>'website');
  perform obs_if(v_id, 'app.platforms',     p->'platforms',              'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'app.privacy_url',   to_jsonb(p->>'privacy_url'), 'declared', 'SRC-049', p->>'privacy_url');
  perform obs_if(v_id, 'provider.country',  to_jsonb(p->>'country'),     'declared', 'SRC-049', p->>'website');
  if jsonb_typeof(p->'free_plan') = 'boolean' then
    perform record_observation(v_id, 'pricing.free_plan', p->'free_plan', v_ev, 'SRC-049', 'medium', p->>'pricing_url');
  end if;

  for pl in select * from jsonb_array_elements(coalesce(p->'plans', '[]'::jsonb)) loop
    v_billing := pl->>'billing_model';
    if v_billing not in ('free','subscription','usage','credits','seat','one_time','enterprise_quote','open_source') then continue; end if;
    v_amount := nullif(pl->>'amount','')::numeric;
    v_currency := coalesce(nullif(upper(pl->>'currency'), ''), 'USD');
    v_interval := nullif(pl->>'interval', '');
    if v_interval not in ('month','year','one_time','per_unit') then v_interval := null; end if;
    if v_billing = 'free' and v_amount is null then v_amount := 0; end if;
    if v_amount is null then continue; end if;
    v_amount := round(v_amount, 4);
    v_plan := coalesce(nullif(pl->>'plan',''), 'Plan') || case when v_interval = 'year' then ' (annual)' else '' end;
    if lower(v_plan) = any(v_seen) then continue; end if;
    v_seen := v_seen || lower(v_plan);
    perform record_price(v_id, v_plan, v_billing, v_amount, v_currency, v_interval, 'SRC-049',
                         nullif(pl->>'unit',''), coalesce((pl->>'is_trial')::boolean, false), p->>'pricing_url', null, v_ev);
  end loop;
  if v_ev = 'observed' then update entities set last_verified_at = now() where id = v_id; end if;

  delete from change_events where entity_id in (v_id, v_co) and detected_at >= v_started
     and event_type in ('new_entity','plan_added','field_changed') and old_value is null;
  return v_id;
end $$;
revoke execute on function ingest_app(jsonb) from public, anon, authenticated;

create or replace function ingest_apps(p jsonb) returns jsonb language plpgsql as $$
declare it jsonb; n int := 0; errs jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(p) loop
    begin perform ingest_app(it); n := n + 1;
    exception when others then errs := errs || jsonb_build_array(jsonb_build_object('name', it->>'name', 'error', sqlerrm)); end;
  end loop;
  return jsonb_build_object('ingested', n, 'errors', errs);
end $$;
revoke execute on function ingest_apps(jsonb) from public, anon, authenticated;

-- public read models
create or replace view v_apps as
select e.id, e.slug, e.name, e.short_description, e.website, e.last_verified_at, e.first_seen_at,
       (select c.name from relations r join entities c on c.id = r.to_id
         where r.from_id = e.id and r.relation = 'made_by' and r.valid_to is null limit 1) as company,
       e.attributes->'provider.country'->>'value' as country,
       e.attributes->'app.theme'->>'value'        as theme,
       e.attributes->'app.platforms'->'value'     as platforms,
       e.attributes->'app.privacy_url'->>'value'  as privacy_url,
       e.attributes->'pricing.url'->>'value'      as pricing_url,
       (select min(cp.amount) from v_current_prices cp where cp.entity_id = e.id and cp.interval = 'month' and cp.currency = 'USD' and cp.amount > 0) as from_usd_month,
       exists (select 1 from v_current_prices cp where cp.entity_id = e.id and (cp.billing_model = 'free' or cp.amount = 0))
         or coalesce((e.attributes->'pricing.free_plan'->>'value')::boolean, false) as has_free
  from entities e
 where e.type = 'app' and e.is_published;

create or replace view v_app_prices as
select e.slug as app_slug, cp.plan_name, cp.billing_model, cp.amount, cp.currency, cp.interval, cp.unit, cp.is_trial,
       cp.evidence_level, cp.observed_at, cp.last_confirmed_at
  from v_current_prices cp join entities e on e.id = cp.entity_id and e.type = 'app' and e.is_published;

grant select on v_apps, v_app_prices to anon, authenticated;

-- publisher emails: apps get their own page link and wording (no paid offer yet)
create or replace function publisher_profile(p_entity uuid) returns text language sql stable set search_path = public as $$
  select case when e.type = 'agent' then 'agent'
              when e.type = 'app' then 'app'
              when e.type = 'mcp_server' and live_check_url(e.id) is not null then 'mcp_hosted'
              when e.type = 'mcp_server' then 'mcp_local' end
    from entities e where e.id = p_entity
$$;

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
      '4. A privacy policy on the website when the product asks for personal data or conversations.' || chr(10) || chr(10) ||
      'If your product changes on one of these points, simply submit it again at https://electraindex.com/submit and we will review it with pleasure.' || chr(10);
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
    chr(10) || case when v_prof = 'app' then 'Show your listing: announce it on LinkedIn in one click:'
                    else 'Show your listing: announce it on LinkedIn in one click and add the Electra Index badge to your site:' end || chr(10) ||
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
revoke execute on function publisher_message(text, uuid, text, boolean, uuid) from public, anon, authenticated;

-- outbound clicks: apps are counted like agents
create or replace function go_outbound(p_type text, p_slug text, p_target text, p_path text default null,
                                       p_visitor text default null, p_human boolean default false,
                                       p_sponsored boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_url text; v_aff text; v_target text := coalesce(nullif(p_target, ''), 'website');
        v_human boolean := coalesce(p_human, false) and p_visitor is not null;
begin
  if p_type not in ('agent','mcp_server','payment_provider','app') or v_target not in ('website','pricing','repository') then
    return null;
  end if;
  select e.id,
         case v_target
           when 'website'    then coalesce(e.website, e.attributes->'website.url'->>'value')
           when 'pricing'    then e.attributes->'pricing.url'->>'value'
           when 'repository' then e.attributes->'repository.url'->>'value'
         end
    into v_id, v_url
    from entities e
   where e.type = p_type and e.slug = p_slug and e.is_published;
  if v_id is null then return null; end if;
  if v_target = 'website' then
    select url into v_aff from affiliate_links where entity_id = v_id and active;
    if v_aff is not null then v_url := v_aff; v_target := 'affiliate'; end if;
  end if;
  if v_url is null or v_url !~* '^https?://' then return null; end if;
  if v_human then
    -- one click per visitor and product per day; more than 20 clicks a day is not a person browsing
    if exists (select 1 from outbound_clicks where visitor = p_visitor and entity_id = v_id and human
                and created_at > date_trunc('day', now()))
       or (select count(*) from outbound_clicks where visitor = p_visitor and created_at > date_trunc('day', now())) >= 20 then
      v_human := false;
    end if;
  end if;
  insert into outbound_clicks(entity_id, page_path, target, visitor, human, sponsored)
  values (v_id, left(coalesce(nullif(p_path, ''), '/'), 300), v_target, left(p_visitor, 64), v_human, coalesce(p_sponsored, false));
  return v_url;
end $$;
revoke execute on function go_outbound(text, text, text, text, text, boolean, boolean) from public;
grant execute on function go_outbound(text, text, text, text, text, boolean, boolean) to anon, authenticated;
