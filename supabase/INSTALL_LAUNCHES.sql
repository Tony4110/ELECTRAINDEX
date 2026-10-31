-- ELECTRA INDEX — INSTALL_LAUNCHES : "Launches" page + public follower count (31 Oct 2026)
--  * A follow counts in the public "▲ followers" number only after a click on the confirmation link
--    (not the publisher's own follows, not unsubscribed ones). Alerts work either way.
--  * The count is shown next to a product, never used in a score or a ranking.
--  * v_launches: products listed in the last 30 days (MCP servers only when their page is a strong one).
-- Paste all in Supabase > SQL Editor > Run. Re-runnable.

alter table page_followers add column if not exists confirm_token uuid not null default gen_random_uuid();
alter table page_followers add column if not exists confirmed_at timestamptz;
create unique index if not exists uq_page_followers_confirm on page_followers(confirm_token);

-- AI apps can be followed too
create or replace function follow_page(p_type text, p_slug text, p_email text, p_role text default 'user',
                                       p_offers boolean default false, p_client text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hash text; v_email text := lower(btrim(coalesce(p_email, ''))); v_etype text;
begin
  v_etype := case p_type when 'agent' then 'agent' when 'mcp' then 'mcp_server' when 'mcp_server' then 'mcp_server' when 'app' then 'app' else null end;
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

create or replace function page_url(p_entity uuid) returns text language sql stable as $$
  select 'https://electraindex.com/' || case type when 'agent' then 'agents/' when 'app' then 'apps/' else 'mcp/' end || slug from entities where id = p_entity
$$;

-- the confirmation email now carries the "confirm" link
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
    chr(10) || 'One more click: confirm your follow so it counts in the public follower count of ' || e.name || ':' || chr(10) ||
    'https://electraindex.com/follow/confirm?t=' || new.confirm_token || chr(10) ||
    '(Alerts work even if you do not confirm.)' || chr(10) ||
    case when new.offers_opt_in then chr(10) || 'You also joined the free Publisher Program. Thank you!' || chr(10) else '' end ||
    chr(10) || 'Did not ask for this? Unsubscribe in one click:' || chr(10) ||
    'https://electraindex.com/unsubscribe?t=' || new.unsub_token || chr(10) || chr(10) ||
    'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com', 200, new.unsub_token);
  return null;
end $$;

-- one click on the link (the page asks for a button press, so mail scanners cannot confirm by themselves)
create or replace function confirm_follow(p_token uuid) returns text language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  update page_followers f set confirmed_at = coalesce(f.confirmed_at, now())
   where f.confirm_token = p_token and f.unsubscribed_at is null
  returning (select name from entities where id = f.entity_id) into v_name;
  return coalesce(v_name, '');
end $$;
revoke execute on function confirm_follow(uuid) from public;
grant execute on function confirm_follow(uuid) to anon, authenticated;

-- public numbers only (no email ever leaves the table)
create or replace view v_follow_counts as
select e.type, e.slug, count(f.id) as followers
  from entities e
  join page_followers f on f.entity_id = e.id
 where e.is_published and f.confirmed_at is not null and f.unsubscribed_at is null and f.role = 'user'
 group by e.type, e.slug;
grant select on v_follow_counts to anon, authenticated;

create or replace view v_launches as
select e.type, e.slug, e.name, e.short_description, e.website, e.first_seen_at,
       case e.type when 'app' then e.attributes->'app.theme'->>'value'
            else (select c.slug from relations r join entities c on c.id = r.to_id
                   where r.from_id = e.id and r.relation = 'in_category' and r.valid_to is null limit 1) end as theme,
       coalesce((select count(*) from page_followers f where f.entity_id = e.id and f.confirmed_at is not null
                   and f.unsubscribed_at is null and f.role = 'user'), 0) as followers
  from entities e
 where e.is_published and e.type in ('agent','app','mcp_server')
   and e.first_seen_at > now() - interval '30 days'
   and (e.type <> 'mcp_server' or exists (select 1 from v_mcp_index i where i.slug = e.slug and i.indexable));
grant select on v_launches to anon, authenticated;

select type, count(*) as launched_last_30_days from v_launches group by type order by type;
