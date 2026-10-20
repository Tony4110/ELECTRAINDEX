-- ELECTRA INDEX — INSTALL_ALERTS_1 : real emails for "Follow" (confirmation + hourly alerts: tool down / back online / new version, agent price changes) + unsubscribe
-- Needs the Resend key in Vault (done). Paste everything into Supabase > SQL Editor > Run. Re-runnable.

-- =====================================================================
-- 0041 — Follow alerts: emails to people who follow a tool or agent page
--  * Right after "Follow": a short confirmation email with a one-click
--    unsubscribe link (also stops anyone subscribing someone else).
--  * Every hour: one email per follower that lists what changed on the
--    pages they follow since the last run:
--      - tools: stopped answering our live check (2 failures in a row),
--               back online, new version
--      - agents: price up / down, plan added / removed / discontinued
--  * Every email has an unsubscribe link (this page / all pages).
--  * Limits: 80 alert emails per day in total, 5 confirmations per email
--    address per day. Sent with Resend (key in Vault, see 0038).
-- =====================================================================
create extension if not exists pg_net;

alter table notify_log add column if not exists recipient text;
alter table mcp_live_status add column if not exists alerted_status text;
-- start from today's state: no alert for what was already known
update mcp_live_status
   set alerted_status = case when status in ('online','auth_required') then status
                             when consecutive_failures >= 2 then 'down' else 'unconfirmed' end
 where alerted_status is null;

create table if not exists alert_state (
  id          int primary key default 1 check (id = 1),
  last_run_at timestamptz not null default now()
);
insert into alert_state(id) values (1) on conflict do nothing;
alter table alert_state enable row level security;

-- generic sender (same Vault key and log as notify_email)
create or replace function send_email(p_kind text, p_to text, p_subject text, p_text text, p_daily_cap int default 80)
returns boolean language plpgsql security definer set search_path = public, net, vault as $$
declare v_key text; rid bigint;
begin
  if (select count(*) from notify_log where kind = p_kind and created_at > now() - interval '1 day' and skipped is null) >= p_daily_cap then
    insert into notify_log(kind, subject, recipient, skipped) values (p_kind, p_subject, p_to, 'daily limit'); return false;
  end if;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then v_key := null;
  end;
  if coalesce(v_key, '') = '' then
    insert into notify_log(kind, subject, recipient, skipped) values (p_kind, p_subject, p_to, 'no resend_api_key in vault'); return false;
  end if;
  select net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('from', 'Electra Index <alerts@electraindex.com>',
                                  'to', jsonb_build_array(p_to),
                                  'reply_to', 'contact@electraindex.com',
                                  'subject', left(p_subject, 200),
                                  'text', p_text),
    timeout_milliseconds := 10000) into rid;
  insert into notify_log(kind, subject, recipient, request_id) values (p_kind, p_subject, p_to, rid);
  return true;
exception when others then
  insert into notify_log(kind, subject, recipient, skipped) values (p_kind, p_subject, p_to, left(sqlerrm, 200));
  return false;
end $$;
revoke execute on function send_email(text, text, text, text, int) from public, anon, authenticated;

create or replace function page_url(p_entity uuid) returns text language sql stable as $$
  select 'https://electraindex.com/' || case type when 'agent' then 'agents/' else 'mcp/' end || slug from entities where id = p_entity
$$;

-- confirmation right after a new follow
create or replace function follow_confirm() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if tg_op = 'UPDATE' and old.unsubscribed_at is null then return null; end if;   -- already active: nothing new
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
    case when new.offers_opt_in then chr(10) || 'You also joined the free Publisher Program. Thank you!' || chr(10) else '' end ||
    chr(10) || 'Did not ask for this? Unsubscribe in one click:' || chr(10) ||
    'https://electraindex.com/unsubscribe?t=' || new.unsub_token || chr(10) || chr(10) ||
    'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com', 200);
  return null;
end $$;
drop trigger if exists page_followers_confirm on page_followers;
create trigger page_followers_confirm after insert or update of unsubscribed_at on page_followers
  for each row execute function follow_confirm();
revoke execute on function follow_confirm() from public, anon, authenticated;

-- hourly digest
create or replace function follow_alerts_dispatch() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz; v_now timestamptz := now(); rec record; n_sent int := 0; n_ev int := 0;
begin
  select last_run_at into v_since from alert_state where id = 1 for update;

  create temp table if not exists _alert_ev (entity_id uuid, at timestamptz, line text) on commit drop;
  truncate _alert_ev;

  -- live check transitions (tools)
  insert into _alert_ev
  select s.entity_id, v_now,
         case when x.shown = 'down' then 'stopped answering our live check (2 checks in a row)'
              else 'is back online: it answered our live check again' end
    from mcp_live_status s
    cross join lateral (select case when s.status in ('online','auth_required') then s.status
                                    when s.consecutive_failures >= 2 then 'down' else 'unconfirmed' end as shown) x
   where (x.shown = 'down' and s.alerted_status = 'online')
      or (x.shown = 'online' and s.alerted_status = 'down');
  update mcp_live_status s
     set alerted_status = case when s.status in ('online','auth_required') then s.status
                               when s.consecutive_failures >= 2 then 'down' else s.alerted_status end
   where s.alerted_status is distinct from (case when s.status in ('online','auth_required') then s.status
                                                 when s.consecutive_failures >= 2 then 'down' else s.alerted_status end);

  -- published change events (versions, prices)
  insert into _alert_ev
  select ev.entity_id, ev.detected_at,
         case ev.event_type
           when 'new_version'    then 'new version ' || coalesce(ev.new_value #>> '{}', '') || coalesce(' (was ' || (ev.old_value #>> '{}') || ')', '')
           when 'price_increase' then 'price up: ' || coalesce((ev.new_value->>'amount') || ' ' || coalesce(ev.new_value->>'currency', ''), '') || coalesce(' (was ' || (ev.old_value->>'amount') || ')', '')
           when 'price_decrease' then 'price down: ' || coalesce((ev.new_value->>'amount') || ' ' || coalesce(ev.new_value->>'currency', ''), '') || coalesce(' (was ' || (ev.old_value->>'amount') || ')', '')
           when 'plan_added'     then 'new plan' || coalesce(': ' || (ev.new_value->>'amount') || ' ' || coalesce(ev.new_value->>'currency', ''), '')
           when 'plan_removed'   then 'a plan was removed'
           when 'discontinued'   then 'a plan was discontinued'
         end
    from change_events ev
   where ev.is_published and ev.detected_at > v_since and ev.detected_at <= v_now
     and ev.event_type in ('new_version','price_increase','price_decrease','plan_added','plan_removed','discontinued')
     and exists (select 1 from page_followers f where f.entity_id = ev.entity_id and f.unsubscribed_at is null);

  select count(*) into n_ev from _alert_ev;

  -- one email per follower
  for rec in
    select f.email,
           min(f.unsub_token::text)::uuid as token,
           string_agg(distinct '- ' || e.name || ' ' || a.line || chr(10) || '  ' || page_url(e.id), chr(10)) as body,
           count(distinct e.id) as pages,
           min(e.name) as first_name
      from _alert_ev a
      join page_followers f on f.entity_id = a.entity_id and f.unsubscribed_at is null and f.created_at < a.at
      join entities e on e.id = a.entity_id
     group by f.email
  loop
    if send_email('follow_alert', rec.email,
         case when rec.pages = 1 then 'Electra Index: ' || rec.first_name || ' changed' else 'Electra Index: ' || rec.pages || ' pages you follow changed' end,
         'Hi,' || chr(10) || chr(10) || 'Our robots detected:' || chr(10) || chr(10) || rec.body || chr(10) || chr(10) ||
         'Every fact on Electra Index shows its source and the date it was checked.' || chr(10) || chr(10) ||
         'Stop these emails: https://electraindex.com/unsubscribe?t=' || rec.token || chr(10) || chr(10) ||
         'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com') then
      n_sent := n_sent + 1;
    end if;
  end loop;

  update alert_state set last_run_at = v_now where id = 1;
  return jsonb_build_object('events', n_ev, 'emails', n_sent);
end $$;
revoke execute on function follow_alerts_dispatch() from public, anon, authenticated;

-- unsubscribe from the link in any email (this page, or every page for that address)
create or replace function unsubscribe_follow(p_token uuid, p_all boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare v_email text; n int;
begin
  select email into v_email from page_followers where unsub_token = p_token;
  if v_email is null then return 0; end if;
  update page_followers set unsubscribed_at = now(), offers_opt_in = false
   where unsubscribed_at is null and (unsub_token = p_token or (p_all and email = v_email));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function unsubscribe_follow(uuid, boolean) from public;
grant execute on function unsubscribe_follow(uuid, boolean) to anon, authenticated;

-- 0042 — follow alerts: hourly digest at :15
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-follow-alerts';
select cron.schedule('electra-follow-alerts', '15 * * * *', $job$ select follow_alerts_dispatch(); $job$);

select 'alerts ready' as status, (select count(*) from page_followers where unsubscribed_at is null) as followers,
       (select count(*) from cron.job where jobname = 'electra-follow-alerts') as cron_job;
