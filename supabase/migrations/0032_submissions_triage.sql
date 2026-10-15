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
