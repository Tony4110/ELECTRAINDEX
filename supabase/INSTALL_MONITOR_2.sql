-- ELECTRA INDEX — INSTALL_MONITOR_2 : Monitoring Pro launch offer (USD 39.99 paid once, for life)
-- Needs INSTALL_MONITOR_1 first (installed). Paste everything into Supabase > SQL Editor > Run. Re-runnable.

-- =====================================================================
-- 0047 — Monitoring Pro launch offer: USD 39.99 paid once, monitoring for
--  as long as Electra Index runs the service ("lifetime"), next to the
--  USD 9.99/month subscription. A lifetime plan has no Stripe subscription
--  (one-off payment), so it never ends by itself.
-- =====================================================================
alter table monitor_subs add column if not exists plan text not null default 'monthly';
alter table monitor_subs drop constraint if exists monitor_subs_plan_check;
alter table monitor_subs add constraint monitor_subs_plan_check check (plan in ('monthly','lifetime'));

drop function if exists monitor_subscribe(text, text, text, text, text, text);
create or replace function monitor_subscribe(p_secret text, p_email text, p_ref text, p_subscription text,
                                             p_customer text default null, p_session text default null,
                                             p_plan text default 'monthly')
returns text language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_plan text := case when p_plan = 'lifetime' then 'lifetime' else 'monthly' end; v_id uuid; v_url text; v_slug text; v_name text; s monitor_subs;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'invalid email'; end if;
  if exists (select 1 from monitor_subs where (p_session is not null and stripe_session = p_session)
                                           or (p_subscription is not null and stripe_subscription = p_subscription)) then
    return 'exists';
  end if;

  v_id := monitor_resolve(p_ref);
  v_url := case when v_id is not null then live_check_url(v_id) end;
  select slug, name into v_slug, v_name from entities where id = v_id;

  insert into monitor_subs(email, server_ref, entity_id, status, stripe_session, stripe_subscription, stripe_customer, plan)
  values (v_email, left(p_ref, 300), v_id, case when v_url is not null then 'active' else 'pending' end,
          p_session, p_subscription, p_customer, v_plan)
  returning * into s;

  if s.status = 'active' then
    perform send_email('monitor_welcome', v_email, 'Monitoring Pro is on for ' || v_name,
      'Hi,' || chr(10) || chr(10) ||
      case when v_plan = 'lifetime' then 'Thank you for joining Electra Index Monitoring Pro with the launch offer: paid once, monitoring for as long as Electra Index runs the service, nothing more to pay. From now on:'
           else 'Thank you for subscribing to Electra Index Monitoring Pro. From now on:' end || chr(10) ||
      '- we connect to ' || v_url || ' every 30 minutes, as an AI assistant would (we never run a tool, never send a key);' || chr(10) ||
      '- you get an email if it stops answering (2 failed checks in a row, so within about an hour), and when it is back;' || chr(10) ||
      '- your private report (keep this link to yourself):' || chr(10) ||
      '  https://electraindex.com/monitor/r/' || s.token || chr(10) || chr(10) ||
      'YOUR STATUS BADGE (paste it in your README or website):' || chr(10) ||
      '[![Electra Index status](https://electraindex.com/api/badge/' || v_slug || ')](https://electraindex.com/mcp/' || v_slug || ')' || chr(10) || chr(10) ||
      'Or in HTML:' || chr(10) ||
      '<a href="https://electraindex.com/mcp/' || v_slug || '"><img src="https://electraindex.com/api/badge/' || v_slug || '" alt="Electra Index status"></a>' || chr(10) || chr(10) ||
      'The first check runs within 30 minutes. Monitoring never changes your rank on Electra Index.' || chr(10) ||
      case when v_plan = 'lifetime' then 'Questions: reply to this email.' else 'Cancel anytime: reply to this email.' end || chr(10) || monitor_signature(), 200);
    perform notify_email('monitor_sold', 'Monitoring Pro ' || case when v_plan = 'lifetime' then 'LIFETIME (launch offer)' else 'monthly' end || ' started: ' || v_name,
      'New Monitoring Pro subscription for ' || v_name || ' (' || v_url || '), customer ' || v_email || ', subscription ' || coalesce(p_subscription, '-') || '.');
  else
    perform send_email('monitor_welcome', v_email, 'Monitoring Pro: which server should we monitor?',
      'Hi,' || chr(10) || chr(10) ||
      'Thank you for joining Electra Index Monitoring Pro' || case when v_plan = 'lifetime' then ' (launch offer, paid once)' else '' end || '.' || chr(10) ||
      case when v_id is null then 'We could not match "' || coalesce(nullif(btrim(p_ref), ''), '(nothing given)') || '" to an MCP server in our index.'
           else v_name || ' has no hosted endpoint that we can check (it seems to run only on the user''s computer).' end || chr(10) || chr(10) ||
      'Please reply with the address of your hosted MCP endpoint (https://…) or the link to its Electra Index page, and we switch the monitoring on within one business day.' || chr(10) ||
      'If your server only runs locally, we refund you in full.' || chr(10) || monitor_signature(), 200);
    perform notify_email('monitor_pending', 'ACTION: Monitoring Pro to set up by hand',
      'Monitoring Pro (' || v_plan || ') paid by ' || v_email || ' but the server could not be matched or has no hosted endpoint.' || chr(10) ||
      'Given: ' || coalesce(p_ref, '(nothing)') || chr(10) || 'Subscription: ' || coalesce(p_subscription, '-') || chr(10) ||
      'Fix: update monitor_subs set entity_id = (select id from entities where slug = ''<slug>''), status = ''active'' where id = ''' || s.id || ''';' || chr(10) ||
      'Or refund it in Stripe.');
  end if;
  return s.status;
end $$;
revoke execute on function monitor_subscribe(text, text, text, text, text, text, text) from public;
grant execute on function monitor_subscribe(text, text, text, text, text, text, text) to anon, authenticated;   -- protected by the secret

drop view if exists v_monitor_report;
create view v_monitor_report as
select m.created_at, m.status, m.plan, m.email, e.name as server, e.slug, live_check_url(m.entity_id) as endpoint,
       m.alerted_status, m.last_alert_at, m.stripe_subscription, m.canceled_at
  from monitor_subs m left join entities e on e.id = m.entity_id
 order by m.created_at desc;
revoke all on v_monitor_report from anon, authenticated;

select 'lifetime offer ready' as status, (select count(*) from monitor_subs) as subscriptions,
       (select count(*) from information_schema.columns where table_name = 'monitor_subs' and column_name = 'plan') as plan_column;
