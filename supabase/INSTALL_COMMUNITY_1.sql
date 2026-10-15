-- ELECTRA INDEX — INSTALL_COMMUNITY_1 : "Is this page accurate?" community reports + robot re-check loop
--   + automatic triage of "List your agent" submissions.
-- Reports never change a score or a fact. Paste everything into Supabase > SQL Editor > Run.

-- =====================================================================
-- 0030 — Community Trust Loop, v1: anonymous structured reports
--  "Robots observe, the community reports, Electra verifies."
--  * Anyone can flag a fact on an agent or tool page (no account): wrong
--    price, outdated info, feature not working, broken link. Optional short
--    note, links refused. Rate limits per visitor (hashed), per page and global.
--  * A report never changes a score or a fact. It opens a review and, for a
--    price report, triggers a robot re-check of the official pricing page
--    within the hour. The robot's result closes the report automatically:
--    prices still on the official page -> "not_confirmed"; prices missing ->
--    "needs_review" (a human looks).
--  * The public sees counts and statuses only, never the notes.
-- =====================================================================
create table if not exists community_reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  entity_id    uuid not null references entities(id) on delete cascade,
  kind         text not null check (kind in ('price_wrong','info_outdated','not_working','broken_link','other')),
  note         text check (note is null or char_length(note) <= 500),
  client_hash  text,
  status       text not null default 'open' check (status in ('open','not_confirmed','confirmed','needs_review','spam','closed')),
  resolved_at  timestamptz,
  resolution   text
);
create index if not exists idx_community_reports_entity on community_reports(entity_id, created_at desc);
create index if not exists idx_community_reports_open on community_reports(status, created_at desc);
alter table community_reports enable row level security;   -- private: no public policy, access via functions/views only

create or replace function submit_report(p_type text, p_slug text, p_kind text, p_note text default null, p_client text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hash text; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_etype text;
begin
  v_etype := case p_type when 'agent' then 'agent' when 'mcp' then 'mcp_server' when 'mcp_server' then 'mcp_server' else null end;
  if v_etype is null or p_kind not in ('price_wrong','info_outdated','not_working','broken_link','other') then return 'invalid'; end if;
  select id into v_id from entities where type = v_etype and slug = p_slug and is_published;
  if v_id is null then return 'invalid'; end if;
  if v_note is not null then
    if v_note ~* '(https?://|www\.|\.(com|io|ai|net|org|xyz|ru|cn)\M)' then return 'links_not_allowed'; end if;
    v_note := left(regexp_replace(v_note, '[[:cntrl:]]', ' ', 'g'), 500);
  end if;
  v_hash := md5(coalesce(nullif(p_client, ''), 'unknown') || ':' || current_date::text || ':electra');
  -- limits: visitor 5/hour and 20/day, page 20/day, whole site 300/hour
  if (select count(*) from community_reports where client_hash = v_hash and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from community_reports where client_hash = v_hash and created_at > now() - interval '1 day') >= 20
     or (select count(*) from community_reports where entity_id = v_id and created_at > now() - interval '1 day') >= 20
     or (select count(*) from community_reports where created_at > now() - interval '1 hour') >= 300 then
    return 'rate_limited';
  end if;
  if exists (select 1 from community_reports where client_hash = v_hash and entity_id = v_id and kind = p_kind and created_at > now() - interval '1 day') then
    return 'already_reported';
  end if;
  insert into community_reports(entity_id, kind, note, client_hash) values (v_id, p_kind, v_note, v_hash);
  -- one open review per page and kind
  if not exists (select 1 from review_queue where entity_id = v_id and reason = 'community_report' and status = 'open' and payload->>'kind' = p_kind) then
    insert into review_queue(entity_id, reason, payload) values (v_id, 'community_report', jsonb_build_object('kind', p_kind));
  end if;
  return 'ok';
end $$;
revoke execute on function submit_report(text, text, text, text, text) from public;
grant execute on function submit_report(text, text, text, text, text) to anon, authenticated;

-- public: counts and status per page (no notes, no visitor data)
create or replace view v_report_status as
select e.type as entity_type, e.slug,
       count(*) filter (where r.status in ('open','needs_review')) as open_reports,
       max(r.created_at) filter (where r.status in ('open','needs_review')) as last_open_at,
       bool_or(r.status = 'needs_review') as under_review,
       max(r.resolved_at) filter (where r.status = 'not_confirmed') as last_rechecked_ok_at
  from community_reports r join entities e on e.id = r.entity_id and e.is_published
 where r.created_at > now() - interval '60 days' and r.status <> 'spam'
 group by e.type, e.slug;
grant select on v_report_status to anon, authenticated;

-- robot re-check of pricing pages that received a price report (hourly)
create or replace function community_recheck_dispatch() returns int language plpgsql security definer set search_path = public, net as $$
declare rec record; rid bigint; n int := 0;
begin
  for rec in
    select distinct e.id, e.attributes->'pricing.url'->>'value' as url
      from community_reports r join entities e on e.id = r.entity_id
     where r.status = 'open' and r.kind in ('price_wrong','info_outdated')
       and e.type in ('agent','payment_provider') and e.is_published
       and coalesce(e.attributes->'pricing.url'->>'value', '') ~* '^https?://'
       and not exists (select 1 from price_watch_checks c where c.entity_id = e.id and c.dispatched_at > r.created_at)
     limit 50
  loop
    select net.http_get(url := rec.url,
                        headers := jsonb_build_object('User-Agent', 'ElectraIndexBot/1.0 (+https://electraindex.com/sources)', 'Accept', 'text/html'),
                        timeout_milliseconds := 20000) into rid;
    insert into price_watch_checks(request_id, entity_id, url) values (rid, rec.id, rec.url) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function community_recheck_dispatch() from public, anon, authenticated;

-- the robot's verdict closes the loop
create or replace function community_reports_on_check() returns trigger language plpgsql security definer set search_path = public as $$
declare st text := new.result->>'status';
begin
  if new.applied and not coalesce(old.applied, false) and st is not null then
    if st in ('confirmed', 'not_readable_recently_confirmed') then
      update community_reports set status = 'not_confirmed', resolved_at = now(),
             resolution = 'Robot re-check: listed prices still shown on the official pricing page'
       where entity_id = new.entity_id and status = 'open' and kind = 'price_wrong' and created_at < new.dispatched_at;
    elsif st = 'mismatch' then
      update community_reports set status = 'needs_review',
             resolution = 'Robot re-check: some listed prices not found on the official page — human review'
       where entity_id = new.entity_id and status = 'open' and kind = 'price_wrong' and created_at < new.dispatched_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_community_reports_on_check on price_watch_checks;
create trigger trg_community_reports_on_check after update on price_watch_checks
  for each row execute function community_reports_on_check();

-- admin: close a report by hand (confirmed / not_confirmed / spam / closed)
create or replace function resolve_report(p_id uuid, p_status text, p_resolution text default null) returns text language sql as $$
  update community_reports set status = p_status, resolved_at = now(), resolution = coalesce(p_resolution, resolution) where id = p_id;
  select 'report ' || p_status;
$$;
revoke execute on function resolve_report(uuid, text, text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('electra-community-recheck', 'electra-community-apply');
select cron.schedule('electra-community-recheck', '40 * * * *', $job$ select community_recheck_dispatch(); $job$);
select cron.schedule('electra-community-apply',   '50 * * * *', $job$ select price_watch_apply(); $job$);

-- =====================================================================
-- 0032 — "List your agent": automatic triage
--  Every new submission is compared with what is already listed (same
--  website domain). Known ones are marked "duplicate" and linked to the
--  listed page; the rest stay "new" for review. accept_submission() and
--  reject_submission() close a submission by hand.
-- =====================================================================
create or replace function host_of(p_url text) returns text language sql immutable as $$
  select nullif(lower(regexp_replace(coalesce(p_url, ''), '^\s*https?://(www\.)?([^/:?#]+).*$', '\2')), '')
$$;

create or replace function submissions_triage() returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select e.id into v_id from entities e
   where e.type in ('agent','mcp_server') and e.is_published
     and host_of(coalesce(e.website, e.attributes->'website.url'->>'value')) = host_of(new.website)
   order by (e.type = case new.kind when 'tool' then 'mcp_server' else 'agent' end) desc, e.first_seen_at
   limit 1;
  if v_id is not null then
    update submissions set status = 'duplicate', entity_id = v_id, reviewed_at = now() where id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists trg_submissions_triage on submissions;
create trigger trg_submissions_triage after insert on submissions for each row execute function submissions_triage();

create or replace function reject_submission(p_id uuid) returns text language sql as $$
  update submissions set status = 'rejected', reviewed_at = now() where id = p_id;
  select 'rejected';
$$;
create or replace function mark_submission_listed(p_id uuid, p_type text, p_slug text) returns text language sql as $$
  update submissions set status = 'listed', reviewed_at = now(),
         entity_id = (select id from entities where type = p_type and slug = p_slug) where id = p_id;
  select 'listed';
$$;
revoke execute on function reject_submission(uuid) from public, anon, authenticated;
revoke execute on function mark_submission_listed(uuid, text, text) from public, anon, authenticated;
revoke execute on function submissions_triage() from public, anon, authenticated;

select 'community reports ready' as status, (select count(*) from cron.job where jobname like 'electra-community-%') as cron_jobs,
       (select count(*) from submissions where status = 'new') as submissions_to_review;
