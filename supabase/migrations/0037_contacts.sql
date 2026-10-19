-- =====================================================================
-- 0037 — Contacts: publishers and users who ask to be kept informed
--  * "List your agent" form: optional, unticked box to also receive
--    Electra Index offers for publishers (submissions.offers_opt_in).
--  * Tool and agent pages: "Follow this page" box. A visitor leaves an
--    email to be told when the robots detect a change (server down, price
--    changed...). Optional, unticked box for offers. Says whether they
--    build it (publisher) or use it.
--  * Emails are private (never published, never in a public view).
--    Each contact has an unsubscribe token for the future e-mail sender.
--  * Rate limits per visitor (hashed per day) and global, like reports.
-- =====================================================================

alter table submissions add column if not exists offers_opt_in boolean not null default false;
grant insert (kind, name, website, pricing_url, theme, description, contact_email, offers_opt_in) on submissions to anon, authenticated;

create table if not exists page_followers (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  entity_id       uuid not null references entities(id) on delete cascade,
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' and char_length(email) <= 200),
  role            text not null default 'user' check (role in ('publisher','user')),
  offers_opt_in   boolean not null default false,
  client_hash     text,
  unsub_token     uuid not null default gen_random_uuid(),
  unsubscribed_at timestamptz
);
create unique index if not exists uq_page_followers on page_followers(entity_id, lower(email));
create index if not exists idx_page_followers_created on page_followers(created_at desc);
alter table page_followers enable row level security;   -- private: no policy, no grant

create or replace function follow_page(p_type text, p_slug text, p_email text, p_role text default 'user',
                                       p_offers boolean default false, p_client text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hash text; v_email text := lower(btrim(coalesce(p_email, ''))); v_etype text;
begin
  v_etype := case p_type when 'agent' then 'agent' when 'mcp' then 'mcp_server' when 'mcp_server' then 'mcp_server' else null end;
  if v_etype is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or char_length(v_email) > 200 then return 'invalid'; end if;
  select id into v_id from entities where type = v_etype and slug = p_slug and is_published;
  if v_id is null then return 'invalid'; end if;
  v_hash := md5(coalesce(nullif(p_client, ''), 'unknown') || ':' || current_date::text || ':electra');
  -- limits: visitor 5/hour and 20/day, whole site 200/hour
  if (select count(*) from page_followers where client_hash = v_hash and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from page_followers where client_hash = v_hash and created_at > now() - interval '1 day') >= 20
     or (select count(*) from page_followers where created_at > now() - interval '1 hour') >= 200 then
    return 'rate_limited';
  end if;
  insert into page_followers(entity_id, email, role, offers_opt_in, client_hash)
  values (v_id, v_email, case when p_role = 'publisher' then 'publisher' else 'user' end, coalesce(p_offers, false), v_hash)
  on conflict (entity_id, lower(email)) do update
     set role = case when excluded.role = 'publisher' then 'publisher' else page_followers.role end,
         offers_opt_in = page_followers.offers_opt_in or excluded.offers_opt_in,
         unsubscribed_at = null;
  return 'ok';
end $$;
revoke execute on function follow_page(text, text, text, text, boolean, text) from public;
grant execute on function follow_page(text, text, text, text, boolean, text) to anon, authenticated;
