-- ELECTRA INDEX — INSTALL_SPOTLIGHT_1 : real human click counting + Launch Spotlight (USD 14.99 once, 60 days)
-- Needs INSTALL_MONITOR_1 first (installed). Paste everything into Supabase > SQL Editor > Run. Re-runnable.

-- =====================================================================
-- 0048 — Count only real human clicks
--  Robots disguised as browsers were following our "Website" buttons
--  (about 10,000 "clicks" a week on 6,800 different pages). From now on a
--  click is marked human only when:
--   * it comes from a page of electraindex.com (the browser says so),
--   * it does not look like a robot (user agent, missing headers),
--   * it is the first click of that visitor on that product today,
--   * that visitor made at most 20 clicks today.
--  Visitor = a one-way hash of (connection + browser + day), computed by the
--  website; it changes every day and cannot be turned back into an address.
--  Every click is still logged (robots too) so we can watch them.
--  Sponsored clicks (Launch Spotlight) are flagged separately.
-- =====================================================================
alter table outbound_clicks add column if not exists human boolean not null default false;
alter table outbound_clicks add column if not exists visitor text;
alter table outbound_clicks add column if not exists sponsored boolean not null default false;
create index if not exists idx_clicks_visitor_day on outbound_clicks(visitor, created_at) where visitor is not null;
create index if not exists idx_clicks_human on outbound_clicks(entity_id, created_at) where human;

drop function if exists go_outbound(text, text, text, text);
create or replace function go_outbound(p_type text, p_slug text, p_target text, p_path text default null,
                                       p_visitor text default null, p_human boolean default false,
                                       p_sponsored boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_url text; v_aff text; v_target text := coalesce(nullif(p_target, ''), 'website');
        v_human boolean := coalesce(p_human, false) and p_visitor is not null;
begin
  if p_type not in ('agent','mcp_server','payment_provider') or v_target not in ('website','pricing','repository') then
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

-- private report: human clicks only
create or replace view v_human_click_report as
select date_trunc('day', c.created_at)::date as day, e.type, e.slug, e.name, c.target, c.sponsored, count(*) as clicks
  from outbound_clicks c join entities e on e.id = c.entity_id
 where c.human
 group by 1, 2, 3, 4, 5, 6
 order by 1 desc, clicks desc;
revoke all on v_human_click_report from anon, authenticated;

-- =====================================================================
-- 0049 — Launch Spotlight (USD 14.99 once, 60 days, no subscription)
--  A publisher buys 60 days of visibility for its agent or MCP server:
--   * a "Sponsored" card on the use-case pages where it already appears
--     (agent tasks, themes, "Best MCP servers for …"), at most 3 sponsors
--     per page, and on the "New" page;
--   * a mention in each weekly Pulse published while it runs;
--   * reports of real (human) clicks: at day 30 and at the end.
--  No subscription: buying again adds 60 days at the same launch price.
--  Guarantee: no human click on the sponsored card in 60 days -> the next
--  60 days are free (once per sponsor).
--  Never inside a ranking, never changes a score.
--  Bought through the Stripe webhook only (secret 'mcp_api_secret').
-- =====================================================================

create table if not exists sponsor_spots (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  email               text not null,
  server_ref          text,
  entity_id           uuid references entities(id) on delete set null,
  status              text not null default 'pending' check (status in ('active','pending','ended')),
  starts_at           timestamptz,
  ends_at             timestamptz,
  pages               text[] not null default '{}',
  stripe_session      text unique,
  token               uuid not null unique default gen_random_uuid(),
  purchases           int not null default 1,
  free_extension_used boolean not null default false,
  mid_report_sent     boolean not null default false
);
create index if not exists idx_sponsor_spots_active on sponsor_spots(status, ends_at);
create index if not exists idx_sponsor_spots_pages on sponsor_spots using gin(pages);
alter table sponsor_spots enable row level security;   -- private

-- which listed agent or MCP server the buyer meant
create or replace function spotlight_resolve(p_ref text) returns uuid language plpgsql stable set search_path = public as $$
declare v text := lower(btrim(coalesce(p_ref, ''))); v_id uuid; v_host text;
begin
  if v = '' then return null; end if;
  if v ~ '/agents/[a-z0-9-]+' then
    select id into v_id from entities where type = 'agent' and is_published and slug = substring(v from '/agents/([a-z0-9-]+)');
    if v_id is not null then return v_id; end if;
  end if;
  if v ~ '/mcp/[a-z0-9-]+' and v !~ '/mcp/best/' then
    select id into v_id from entities where type = 'mcp_server' and is_published and slug = substring(v from '/mcp/([a-z0-9-]+)');
    if v_id is not null then return v_id; end if;
  end if;
  if v ~ '^https?://' and v !~ 'electraindex\.com' then
    v_host := host_of(v);
    select id into v_id from entities
     where type in ('agent','mcp_server') and is_published
       and host_of(coalesce(website, attributes->'website.url'->>'value')) = v_host
     order by (type = 'agent') desc, last_seen_at desc nulls last limit 1;
    if v_id is not null then return v_id; end if;
    v_id := monitor_resolve(v);                 -- an MCP endpoint URL
    if v_id is not null then return v_id; end if;
  end if;
  select id into v_id from entities where type in ('agent','mcp_server') and is_published and (slug = v or lower(name) = v)
   order by (type = 'agent') desc, last_seen_at desc nulls last limit 1;
  return v_id;
end $$;

-- the use-case pages where this product already appears (with a free sponsor place), plus "New"
create or replace function spotlight_pages(p_entity uuid) returns text[] language plpgsql stable set search_path = public as $$
declare v_type text; v_slug text; r text[];
begin
  select type, slug into v_type, v_slug from entities where id = p_entity;
  if v_type is null then return array['/new']; end if;
  with cand as (
    (select '/tasks/' || task_slug as p, 1 as prio, coverage_pct as w from v_task_rankings
      where provider_id = p_entity order by coverage_pct desc nulls last limit 4)
    union all
    (select '/themes/' || theme_slug, 2, coalesce(coverage_score, 0) from v_theme_rankings
      where provider_id = p_entity and coalesce(listed_in_theme, true) order by coverage_score desc nulls last limit 2)
    union all
    (select '/mcp/best/' || t.capability_slug, 1, 100 from mv_capability_tools t
       join v_capability_overview o on o.capability_slug = t.capability_slug and o.tools >= 5
      where v_type = 'mcp_server' and t.tool_id = p_entity order by t.name_match desc, o.tools desc limit 4)
    union all
    (select '/mcp/best/' || pc.capability_slug, 2, 50 from v_provider_capabilities pc
       join v_capability_overview o on o.capability_slug = pc.capability_slug and o.tools >= 5
      where v_type = 'agent' and pc.provider_type = 'agent' and pc.provider_slug = v_slug order by o.tools desc limit 2)
  ), free as (
    select distinct on (p) p, prio, w from cand
     where (select count(*) from sponsor_spots s where s.status = 'active' and s.entity_id is distinct from p_entity and p = any(s.pages)) < 3
     order by p, prio, w desc
  )
  select array_agg(p order by prio, w desc) into r from (select * from free order by prio, w desc limit 8) x;
  return coalesce(r, '{}') || array['/new'];
end $$;

create or replace function spotlight_signature() returns text language sql immutable as $$
  select chr(10) || 'Tony Nelson' || chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com'
$$;

create or replace function spotlight_page_list(p_pages text[]) returns text language sql immutable as $$
  select coalesce(string_agg('- https://electraindex.com' || p, chr(10)), '- https://electraindex.com/new') from unnest(p_pages) p
$$;

-- human clicks to the product's site during a spot (sponsored card / anywhere on the site)
create or replace function spotlight_clicks(p_entity uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'sponsored', count(*) filter (where sponsored),
    'total', count(*),
    'by_page', coalesce((select jsonb_agg(jsonb_build_object('page', page_path, 'clicks', n) order by n desc)
                           from (select page_path, count(*) n from outbound_clicks
                                  where entity_id = p_entity and human and created_at >= p_from and created_at < p_to
                                  group by 1 order by 2 desc limit 10) q), '[]'))
    from outbound_clicks
   where entity_id = p_entity and human and created_at >= p_from and created_at < p_to
$$;

-- purchase (Stripe webhook). Idempotent on the Stripe session. A second purchase adds 60 days.
create or replace function spotlight_buy(p_secret text, p_email text, p_ref text, p_session text default null, p_days int default 60)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid; v_name text; v_type text; v_slug text; s sponsor_spots;
        v_days int := greatest(coalesce(p_days, 60), 1);
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'invalid email'; end if;
  if p_session is not null and exists (select 1 from sponsor_spots where stripe_session = p_session) then return 'exists'; end if;

  v_id := spotlight_resolve(p_ref);
  select name, type, slug into v_name, v_type, v_slug from entities where id = v_id;

  -- renewal: the same product already has a spot running (or pending) -> add 60 days
  select * into s from sponsor_spots where entity_id = v_id and v_id is not null and status in ('active','pending')
   order by ends_at desc nulls last limit 1;
  if found then
    update sponsor_spots set ends_at = greatest(coalesce(ends_at, now()), now()) + make_interval(days => v_days),
                             purchases = purchases + 1, status = 'active', starts_at = coalesce(starts_at, now())
     where id = s.id returning * into s;
    insert into sponsor_spots(email, server_ref, entity_id, status, stripe_session, starts_at, ends_at)   -- keeps the session for idempotency
    values (v_email, left('renewal: ' || coalesce(p_ref, ''), 300), v_id, 'ended', p_session, now(), now());
    perform send_email('spotlight', v_email, 'Launch Spotlight renewed for ' || v_name,
      'Hi,' || chr(10) || chr(10) || 'Thank you: ' || v_name || ' stays in the Electra Index Launch Spotlight until ' ||
      to_char(s.ends_at at time zone 'utc', 'DD Mon YYYY') || ', at the same launch price.' || chr(10) || chr(10) ||
      'Your report: https://electraindex.com/spotlight/r/' || s.token || chr(10) || spotlight_signature(), 200);
    perform notify_email('spotlight_sold', 'Launch Spotlight renewed: ' || v_name, 'Renewal by ' || v_email || ', now until ' || s.ends_at::date || '.');
    return 'renewed';
  end if;

  insert into sponsor_spots(email, server_ref, entity_id, status, stripe_session, starts_at, ends_at, pages)
  values (v_email, left(p_ref, 300), v_id, case when v_id is null then 'pending' else 'active' end, p_session,
          case when v_id is not null then now() end,
          case when v_id is not null then now() + make_interval(days => v_days) end,
          case when v_id is not null then spotlight_pages(v_id) else '{}' end)
  returning * into s;

  if s.status = 'active' then
    perform send_email('spotlight', v_email, 'Your Launch Spotlight is live: ' || v_name,
      'Hi,' || chr(10) || chr(10) ||
      'Thank you for choosing the Electra Index Launch Spotlight. ' || v_name || ' is now shown as a Sponsored card, until ' ||
      to_char(s.ends_at at time zone 'utc', 'DD Mon YYYY') || ', on these pages:' || chr(10) ||
      spotlight_page_list(s.pages) || chr(10) || chr(10) ||
      'It will also be mentioned in the weekly MCP & Agent Pulse (https://electraindex.com/pulse).' || chr(10) || chr(10) ||
      'Your private report (real visitor clicks, robots excluded):' || chr(10) ||
      'https://electraindex.com/spotlight/r/' || s.token || chr(10) ||
      'We also email it to you after 30 days and at the end.' || chr(10) || chr(10) ||
      'No subscription: nothing will be charged again. Want more time? Buy another 60 days at the same launch price, anytime.' || chr(10) ||
      'Our promise: if your Sponsored card gets no click in 60 days, the next 60 days are free.' || chr(10) || chr(10) ||
      'Sponsored cards are always labelled and never change a score or a rank on Electra Index.' || chr(10) || spotlight_signature(), 200);
    perform notify_email('spotlight_sold', 'Launch Spotlight sold: ' || v_name,
      'New Launch Spotlight for ' || v_name || ' (' || v_type || '/' || v_slug || '), bought by ' || v_email || ', ' || cardinality(s.pages) || ' pages.');
  else
    perform send_email('spotlight', v_email, 'Launch Spotlight: which product should we feature?',
      'Hi,' || chr(10) || chr(10) || 'Thank you for choosing the Electra Index Launch Spotlight.' || chr(10) ||
      'We could not match "' || coalesce(nullif(btrim(p_ref), ''), '(nothing given)') || '" to an agent or MCP server listed on Electra Index.' || chr(10) || chr(10) ||
      'Please reply with the link to your page on Electra Index (https://electraindex.com/agents/… or /mcp/…), or your website, and we start your 60 days within one business day.' || chr(10) ||
      'Not listed yet? Submit it for free at https://electraindex.com/submit and reply to this email.' || chr(10) || spotlight_signature(), 200);
    perform notify_email('spotlight_pending', 'ACTION: Launch Spotlight to set up by hand',
      'Paid by ' || v_email || ', product not matched. Given: ' || coalesce(p_ref, '(nothing)') || chr(10) ||
      'Fix: update sponsor_spots set entity_id = (select id from entities where slug = ''<slug>'' and type = ''agent''), status = ''active'', starts_at = now(), ends_at = now() + interval ''60 days'' where id = ''' || s.id || ''';' || chr(10) ||
      'then: update sponsor_spots set pages = spotlight_pages(entity_id) where id = ''' || s.id || ''';');
  end if;
  return s.status;
end $$;
revoke execute on function spotlight_buy(text, text, text, text, int) from public;
grant execute on function spotlight_buy(text, text, text, text, int) to anon, authenticated;   -- protected by the secret

-- public: sponsors to show on a page (at most 3, in random order)
create or replace function spotlight_for_page(p_path text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select jsonb_build_object('type', case e.type when 'agent' then 'agent' else 'mcp' end, 'slug', e.slug, 'name', e.name,
                              'description', left(e.short_description, 160),
                              'host', host_of(coalesce(e.website, e.attributes->'website.url'->>'value'))) as x
      from sponsor_spots s join entities e on e.id = s.entity_id and e.is_published
     where s.status = 'active' and s.ends_at > now() and p_path = any(s.pages)
     order by random() limit 3) q
$$;
revoke execute on function spotlight_for_page(text) from public;
grant execute on function spotlight_for_page(text) to anon, authenticated;

-- private report (secret link)
create or replace function spotlight_report(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sponsor_spots; e record;
begin
  select * into s from sponsor_spots where token = p_token;
  if not found then return null; end if;
  select type, slug, name into e from entities where id = s.entity_id;
  return jsonb_build_object('status', s.status, 'name', e.name, 'slug', e.slug, 'type', case e.type when 'agent' then 'agent' else 'mcp' end,
    'server_ref', s.server_ref, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'pages', to_jsonb(s.pages),
    'purchases', s.purchases, 'free_extension_used', s.free_extension_used,
    'clicks', case when s.entity_id is not null and s.starts_at is not null then spotlight_clicks(s.entity_id, s.starts_at, least(now(), s.ends_at)) end);
end $$;
revoke execute on function spotlight_report(uuid) from public;
grant execute on function spotlight_report(uuid) to anon, authenticated;   -- protected by the secret token

-- daily: mid-run report, end of run (report, or free 60 days when no sponsored click)
create or replace function spotlight_tick() returns jsonb language plpgsql security definer set search_path = public as $$
declare rec record; k jsonb; n_mid int := 0; n_end int := 0; n_free int := 0;
begin
  for rec in
    select s.*, e.name from sponsor_spots s join entities e on e.id = s.entity_id
     where s.status = 'active' and s.ends_at is not null
  loop
    k := spotlight_clicks(rec.entity_id, rec.starts_at, least(now(), rec.ends_at));
    if rec.ends_at <= now() then
      if (k->>'sponsored')::int = 0 and not rec.free_extension_used then
        update sponsor_spots set ends_at = now() + interval '60 days', free_extension_used = true,
               pages = spotlight_pages(entity_id) where id = rec.id;
        perform send_email('spotlight', rec.email, 'Your Launch Spotlight continues for free: ' || rec.name,
          'Hi,' || chr(10) || chr(10) || 'As promised: your Sponsored card for ' || rec.name || ' got no click in its first 60 days, so we keep it running for another 60 days, free of charge.' || chr(10) ||
          'Human clicks to your site from Electra Index in the period: ' || (k->>'total') || '.' || chr(10) || chr(10) ||
          'Your report: https://electraindex.com/spotlight/r/' || rec.token || chr(10) || spotlight_signature(), 200);
        n_free := n_free + 1;
      else
        update sponsor_spots set status = 'ended' where id = rec.id;
        perform send_email('spotlight', rec.email, 'Your Launch Spotlight report: ' || rec.name,
          'Hi,' || chr(10) || chr(10) || 'Your Launch Spotlight for ' || rec.name || ' has ended. Real visitor clicks (robots excluded):' || chr(10) ||
          '- on your Sponsored card: ' || (k->>'sponsored') || chr(10) ||
          '- to your site from all Electra Index pages: ' || (k->>'total') || chr(10) || chr(10) ||
          'Full report: https://electraindex.com/spotlight/r/' || rec.token || chr(10) || chr(10) ||
          'Want 60 more days at the same launch price? https://electraindex.com/spotlight' || chr(10) || spotlight_signature(), 200);
        n_end := n_end + 1;
      end if;
    elsif not rec.mid_report_sent and rec.starts_at < now() - interval '30 days' then
      update sponsor_spots set mid_report_sent = true where id = rec.id;
      perform send_email('spotlight', rec.email, 'Launch Spotlight, 30 days in: ' || rec.name,
        'Hi,' || chr(10) || chr(10) || 'Halfway report for ' || rec.name || ' (real visitor clicks, robots excluded):' || chr(10) ||
        '- on your Sponsored card: ' || (k->>'sponsored') || chr(10) ||
        '- to your site from all Electra Index pages: ' || (k->>'total') || chr(10) || chr(10) ||
        'Your Spotlight runs until ' || to_char(rec.ends_at at time zone 'utc', 'DD Mon YYYY') || '. Full report: https://electraindex.com/spotlight/r/' || rec.token || chr(10) || spotlight_signature(), 200);
      n_mid := n_mid + 1;
    end if;
  end loop;
  return jsonb_build_object('mid_reports', n_mid, 'ended', n_end, 'free_extensions', n_free);
end $$;
revoke execute on function spotlight_tick() from public, anon, authenticated;

-- the weekly Pulse lists the sponsors running that week (labelled as such)
create or replace function pulse_publish(p_start date default (date_trunc('week', now() at time zone 'utc')::date - 7))
returns text language plpgsql security definer set search_path = public as $$
declare v_start date := date_trunc('week', p_start)::date; v_week text := to_char(v_start, 'IYYY-"W"IW'); v_data jsonb;
begin
  v_data := pulse_build(v_start) || jsonb_build_object('sponsors', (
    select coalesce(jsonb_agg(jsonb_build_object('type', case e.type when 'agent' then 'agent' else 'mcp' end, 'slug', e.slug, 'name', e.name,
                                                 'description', left(e.short_description, 160)) order by s.starts_at), '[]')
      from sponsor_spots s join entities e on e.id = s.entity_id and e.is_published
     where s.status = 'active' and s.starts_at < (v_start + 7)::timestamptz and s.ends_at > v_start::timestamptz));
  insert into pulse_editions(week, week_start, data, built_at) values (v_week, v_start, v_data, now())
  on conflict (week) do update set data = excluded.data, built_at = now();
  return v_week;
end $$;
revoke execute on function pulse_publish(date) from public, anon, authenticated;

create or replace view v_spotlight_report as
select s.created_at, s.status, s.email, e.name, e.slug, s.starts_at::date as starts, s.ends_at::date as ends,
       cardinality(s.pages) as pages, s.purchases, s.free_extension_used,
       case when s.starts_at is not null and s.entity_id is not null then spotlight_clicks(s.entity_id, s.starts_at, least(now(), s.ends_at)) end as clicks
  from sponsor_spots s left join entities e on e.id = s.entity_id
 order by s.created_at desc;
revoke all on v_spotlight_report from anon, authenticated;

-- public: preview where a product would appear (the /spotlight page, before paying)
create or replace function spotlight_preview(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; e record;
begin
  v_id := spotlight_resolve(left(p_ref, 300));
  if v_id is null then return jsonb_build_object('found', false); end if;
  select type, slug, name into e from entities where id = v_id;
  return jsonb_build_object('found', true, 'type', case e.type when 'agent' then 'agent' else 'mcp' end, 'slug', e.slug, 'name', e.name,
                            'pages', to_jsonb(spotlight_pages(v_id)),
                            'running', exists (select 1 from sponsor_spots where entity_id = v_id and status = 'active'));
end $$;
revoke execute on function spotlight_preview(text) from public;
grant execute on function spotlight_preview(text) to anon, authenticated;

-- 0050 — Launch Spotlight: daily reports, end of runs and free extensions (07:20 UTC)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-spotlight-tick';
select cron.schedule('electra-spotlight-tick', '20 7 * * *', $job$ select spotlight_tick(); $job$);

select 'spotlight ready' as status, (select count(*) from sponsor_spots) as spots,
       (select count(*) from cron.job where jobname = 'electra-spotlight-tick') as cron_job,
       (select count(*) from information_schema.columns where table_name = 'outbound_clicks' and column_name = 'human') as human_column;
