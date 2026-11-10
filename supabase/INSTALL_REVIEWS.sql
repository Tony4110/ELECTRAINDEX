-- ELECTRA INDEX — INSTALL_REVIEWS : user reviews on agent, MCP server and AI app pages
--  * table entity_reviews: rating 1-5, short text, first name, how it was used; e-mail kept private;
--  * every review starts as 'pending' and appears on the site only once you set status = 'approved'
--    (Supabase > Table Editor > entity_reviews), so nothing unverified is ever published;
--  * submit_review(): the only way the site can write, with the same rate limits as Follow;
--  * v_reviews: public view, approved reviews only, without e-mail or client hash.
--  Paste everything in Supabase > SQL Editor > Run. Re-runnable.

create table if not exists entity_reviews (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references entities(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  body         text not null check (char_length(body) between 20 and 1200),
  author_name  text not null check (char_length(author_name) between 2 and 60),
  used_for     text check (char_length(used_for) <= 120),
  email        text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  client_hash  text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists idx_entity_reviews_entity on entity_reviews(entity_id, status, created_at desc);
alter table entity_reviews enable row level security;   -- no policy: nobody reads or writes the table directly

create or replace function submit_review(p_type text, p_slug text, p_rating int, p_body text, p_name text,
                                         p_used_for text, p_email text, p_client text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hash text; v_email text := lower(btrim(coalesce(p_email, ''))); v_etype text;
        v_body text := btrim(coalesce(p_body, '')); v_name text := btrim(coalesce(p_name, ''));
begin
  v_etype := case p_type when 'agent' then 'agent' when 'mcp' then 'mcp_server' when 'mcp_server' then 'mcp_server' when 'app' then 'app' else null end;
  if v_etype is null or p_rating is null or p_rating not between 1 and 5
     or char_length(v_body) not between 20 and 1200 or char_length(v_name) not between 2 and 60
     or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or char_length(v_email) > 200 then return 'invalid'; end if;
  select id into v_id from entities where type = v_etype and slug = p_slug and is_published;
  if v_id is null then return 'invalid'; end if;
  v_hash := md5(coalesce(nullif(p_client, ''), 'unknown') || ':' || current_date::text || ':electra-review');
  -- limits: visitor 3/hour and 10/day, whole site 100/hour, one review per e-mail per product
  if (select count(*) from entity_reviews where client_hash = v_hash and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from entity_reviews where client_hash = v_hash and created_at > now() - interval '1 day') >= 10
     or (select count(*) from entity_reviews where created_at > now() - interval '1 hour') >= 100 then
    return 'rate_limited';
  end if;
  if exists (select 1 from entity_reviews where entity_id = v_id and lower(email) = v_email and status <> 'rejected') then
    return 'duplicate';
  end if;
  insert into entity_reviews(entity_id, rating, body, author_name, used_for, email, client_hash)
  values (v_id, p_rating, v_body, v_name, nullif(btrim(coalesce(p_used_for, '')), ''), v_email, v_hash);
  return 'ok';
end $$;
revoke execute on function submit_review(text, text, int, text, text, text, text, text) from public;
grant execute on function submit_review(text, text, int, text, text, text, text, text) to anon, authenticated;

create or replace view v_reviews as
select r.id, e.type, e.slug, r.rating, r.body, r.author_name, r.used_for, r.created_at
from entity_reviews r join entities e on e.id = r.entity_id
where r.status = 'approved' and e.is_published;
grant select on v_reviews to anon, authenticated;

select 'reviews installed' as result;
