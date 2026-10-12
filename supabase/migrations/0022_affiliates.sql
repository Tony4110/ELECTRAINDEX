-- =====================================================================
-- 0022 — Affiliate programs (tracker) and affiliate links
--  * affiliate_programs: the researched programs (who pays what, where to
--    apply) + your application status. Private: edit it in Table Editor.
--  * set_affiliate_link(type, slug, url): once a program accepts you, paste
--    your personal link once. "Visit website" then goes through it and the
--    click is counted as 'affiliate'. clear_affiliate_link() undoes it.
--  * Public site only learns WHETHER a link is an affiliate link (to show the
--    disclosure), never the commission.
--  * Neutrality rule: affiliate status is never read by any score or ranking.
-- =====================================================================
create table if not exists affiliate_programs (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid references entities(id) on delete set null,
  vendor             text not null unique,
  program_type       text,
  program_url        text,
  network            text,
  commission         text,
  commission_percent numeric,
  recurring          boolean,
  duration_months    numeric,
  cookie_days        int,
  requirements       text,
  sources            jsonb,
  checked_at         date,
  notes              text,
  status             text not null default 'to_apply' check (status in ('to_apply','applied','approved','rejected','not_eligible','skip')),
  applied_at         date,
  updated_at         timestamptz not null default now()
);
alter table affiliate_programs enable row level security;   -- private: no public policy

create table if not exists affiliate_links (
  entity_id   uuid primary key references entities(id) on delete cascade,
  url         text not null check (url ~* '^https?://'),
  program_id  uuid references affiliate_programs(id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table affiliate_links enable row level security;      -- private

-- public: only the fact that the website link is an affiliate link (for the disclosure)
create or replace view v_affiliate_flags as
select e.type, e.slug from affiliate_links l join entities e on e.id = l.entity_id where l.active and e.is_published;
grant select on v_affiliate_flags to anon, authenticated;

create or replace function set_affiliate_link(p_type text, p_slug text, p_url text) returns text language plpgsql as $$
declare v_id uuid; v_prog uuid;
begin
  select id into v_id from entities where type = p_type and slug = p_slug;
  if v_id is null then raise exception 'No % with slug %', p_type, p_slug; end if;
  if p_url !~* '^https?://' then raise exception 'The link must start with https://'; end if;
  select id into v_prog from affiliate_programs where entity_id = v_id limit 1;
  insert into affiliate_links(entity_id, url, program_id) values (v_id, p_url, v_prog)
  on conflict (entity_id) do update set url = excluded.url, active = true, updated_at = now();
  update affiliate_programs set status = 'approved', updated_at = now() where id = v_prog and status <> 'approved';
  return 'affiliate link set for ' || p_slug;
end $$;
create or replace function clear_affiliate_link(p_type text, p_slug text) returns text language sql as $$
  update affiliate_links set active = false, updated_at = now()
   where entity_id = (select id from entities where type = p_type and slug = p_slug);
  select 'affiliate link removed for ' || p_slug;
$$;
revoke execute on function set_affiliate_link(text, text, text) from public, anon, authenticated;
revoke execute on function clear_affiliate_link(text, text) from public, anon, authenticated;

-- outbound redirect: the website button uses the affiliate link when there is an active one
create or replace function go_outbound(p_type text, p_slug text, p_target text, p_path text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_url text; v_aff text; v_target text := coalesce(nullif(p_target, ''), 'website');
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
  insert into outbound_clicks(entity_id, page_path, target)
  values (v_id, left(coalesce(nullif(p_path, ''), '/'), 300), v_target);
  return v_url;
end $$;
revoke execute on function go_outbound(text, text, text, text) from public;
grant execute on function go_outbound(text, text, text, text) to anon, authenticated;

create or replace function load_affiliate_programs(p jsonb) returns int language plpgsql as $$
declare it jsonb; n int := 0; v_id uuid;
begin
  for it in select * from jsonb_array_elements(p) loop
    if coalesce((it->>'has_program')::boolean, false) is not true then continue; end if;
    select id into v_id from entities where type = 'agent' and lower(name) = lower(it->>'name') limit 1;
    insert into affiliate_programs(entity_id, vendor, program_type, program_url, network, commission, commission_percent,
                                   recurring, duration_months, cookie_days, requirements, sources, checked_at, notes, status)
    values (v_id, it->>'name', it->>'program_type', it->>'program_url', it->>'network', it->>'commission',
            nullif(it->>'commission_percent','')::numeric, nullif(it->>'recurring','')::boolean,
            nullif(it->>'duration_months','')::numeric, nullif(it->>'cookie_days','')::int, it->>'requirements',
            it->'sources', nullif(it->>'checked_at','')::date, it->>'notes',
            case when it->>'program_type' = 'reseller_or_solution_partner' then 'skip' else 'to_apply' end)
    on conflict (vendor) do update set
      entity_id = excluded.entity_id, program_type = excluded.program_type, program_url = excluded.program_url,
      network = excluded.network, commission = excluded.commission, commission_percent = excluded.commission_percent,
      recurring = excluded.recurring, duration_months = excluded.duration_months, cookie_days = excluded.cookie_days,
      requirements = excluded.requirements, sources = excluded.sources, checked_at = excluded.checked_at,
      notes = excluded.notes, updated_at = now();          -- status you set by hand is kept
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function load_affiliate_programs(jsonb) from public, anon, authenticated;
