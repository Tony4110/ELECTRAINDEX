-- =====================================================================
-- 0038 — Email notifications to contact@electraindex.com (Resend, via pg_net)
--  Sends a short email when:
--    * a "List your agent" request arrives (submissions)
--    * a publisher joins the Publisher Program on a page (page_followers)
--  The Resend API key is read from Supabase Vault (secret name: resend_api_key).
--  It is never stored in a table, a file or the chat.
--  Safe by design: if the key is missing or Resend is down, the visitor's
--  form still works (the email is simply not sent). Max 30 emails per hour.
-- =====================================================================
create extension if not exists pg_net;

create table if not exists notify_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null,
  subject    text not null,
  request_id bigint,
  skipped    text
);
alter table notify_log enable row level security;   -- private

create or replace function notify_email(p_kind text, p_subject text, p_text text) returns void
language plpgsql security definer set search_path = public, net, vault as $$
declare v_key text; rid bigint;
begin
  if (select count(*) from notify_log where created_at > now() - interval '1 hour' and skipped is null) >= 30 then
    insert into notify_log(kind, subject, skipped) values (p_kind, p_subject, 'hourly limit'); return;
  end if;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then v_key := null;
  end;
  if coalesce(v_key, '') = '' then
    insert into notify_log(kind, subject, skipped) values (p_kind, p_subject, 'no resend_api_key in vault'); return;
  end if;
  select net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('from', 'Electra Index <notifications@electraindex.com>',
                                  'to', jsonb_build_array('contact@electraindex.com'),
                                  'subject', left(p_subject, 200),
                                  'text', p_text),
    timeout_milliseconds := 10000) into rid;
  insert into notify_log(kind, subject, request_id) values (p_kind, p_subject, rid);
exception when others then
  insert into notify_log(kind, subject, skipped) values (p_kind, p_subject, left(sqlerrm, 200));
end $$;
revoke execute on function notify_email(text, text, text) from public, anon, authenticated;

-- new "List your agent" request
create or replace function notify_on_submission() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify_email('submission',
    'New listing request: ' || new.name || ' (' || new.kind || ')' || case when new.status = 'duplicate' then ' — already listed' else '' end,
    'A new "List your agent" request arrived on Electra Index.' || chr(10) || chr(10) ||
    'Name: ' || new.name || chr(10) ||
    'Type: ' || new.kind || chr(10) ||
    'Website: ' || new.website || chr(10) ||
    'Pricing page: ' || coalesce(new.pricing_url, '-') || chr(10) ||
    'Theme: ' || coalesce(new.theme, '-') || chr(10) ||
    'Description: ' || coalesce(new.description, '-') || chr(10) ||
    'Contact: ' || new.contact_email || chr(10) ||
    'Publisher Program: ' || case when new.offers_opt_in then 'YES' else 'no' end || chr(10) ||
    'Status: ' || new.status || chr(10) || chr(10) ||
    'To review them all: run REPORT_COMMUNITY.sql in Supabase.');
  return null;
end $$;
drop trigger if exists submissions_notify on submissions;
create trigger submissions_notify after insert on submissions for each row execute function notify_on_submission();

-- a publisher joins the Publisher Program from a page
create or replace function notify_on_follow() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if new.role = 'publisher' and new.offers_opt_in and (tg_op = 'INSERT' or not coalesce(old.offers_opt_in, false)) then
    select type, slug, name into e from entities where id = new.entity_id;
    perform notify_email('publisher_program',
      'New Publisher Program member: ' || e.name,
      'A publisher joined the Publisher Program on Electra Index.' || chr(10) || chr(10) ||
      'Product: ' || e.name || chr(10) ||
      'Page: https://electraindex.com/' || case e.type when 'agent' then 'agents/' else 'mcp/' end || e.slug || chr(10) ||
      'Email: ' || new.email || chr(10) || chr(10) ||
      'Full list: run EXPORT_CONTACTS.sql in Supabase.');
  end if;
  return null;
end $$;
drop trigger if exists page_followers_notify on page_followers;
create trigger page_followers_notify after insert or update of offers_opt_in, role on page_followers
  for each row execute function notify_on_follow();

revoke execute on function notify_on_submission() from public, anon, authenticated;
revoke execute on function notify_on_follow() from public, anon, authenticated;
