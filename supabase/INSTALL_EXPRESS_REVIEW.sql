-- ELECTRA INDEX — INSTALL_EXPRESS_REVIEW : paid "Express review" for listing requests (2 Nov 2026)
--  The publisher pays to be REVIEWED faster (within 48 hours), never to be listed or ranked:
--  same criteria for everyone, full refund if the product is not listed, no effect on any score.
--  Flow: the List your agent form saves the request with a private token, the buyer pays on Stripe,
--  the Stripe webhook calls express_paid(): the request is flagged, Tony gets an "EXPRESS" email, the buyer a confirmation.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

alter table submissions add column if not exists express_token   uuid;
alter table submissions add column if not exists express_paid_at timestamptz;
alter table submissions add column if not exists express_session text;
create unique index if not exists uq_submissions_express_token on submissions(express_token) where express_token is not null;
grant insert (kind, name, website, pricing_url, theme, description, contact_email, offers_opt_in, express_token) on submissions to anon, authenticated;

create or replace function express_paid(p_secret text, p_token text, p_email text, p_session text default null)
returns text language plpgsql security definer set search_path = public as $$
declare s submissions; v_tok uuid;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_session is not null and exists (select 1 from submissions where express_session = p_session) then return 'exists'; end if;
  begin v_tok := nullif(btrim(coalesce(p_token, '')), '')::uuid; exception when others then v_tok := null; end;
  update submissions set express_paid_at = now(), express_session = p_session
   where express_token = v_tok and express_paid_at is null
  returning * into s;
  perform notify_email('express',
    'EXPRESS review paid (48 h): ' || coalesce(s.name, 'unknown request') || coalesce(' (' || s.kind || ')', ''),
    'An Express review was paid on Electra Index. Review it within 48 hours, or refund it in Stripe if it is not listed.' || chr(10) || chr(10) ||
    'Name: ' || coalesce(s.name, '- (no matching request, token ' || coalesce(p_token, 'none') || ')') || chr(10) ||
    'Type: ' || coalesce(s.kind, '-') || chr(10) ||
    'Website: ' || coalesce(s.website, '-') || chr(10) ||
    'Pricing page: ' || coalesce(s.pricing_url, '-') || chr(10) ||
    'Description: ' || coalesce(s.description, '-') || chr(10) ||
    'Contact: ' || coalesce(s.contact_email, '-') || chr(10) ||
    'Paid by: ' || coalesce(p_email, '-') || chr(10) ||
    'Stripe session: ' || coalesce(p_session, '-'));
  if coalesce(p_email, '') <> '' then
    perform send_email('express_confirm', p_email,
      'Express review confirmed: ' || coalesce(s.name, 'your listing request'),
      'Hi,' || chr(10) || chr(10) ||
      'Thank you. We received your Express review payment for ' || coalesce(s.name, 'your listing request') || ' on Electra Index.' || chr(10) || chr(10) ||
      'We will review it within 48 hours against the same criteria we apply to everyone: what the product does, a public price, an identifiable publisher and a privacy policy.' || chr(10) ||
      'If it is listed, you will receive your page link. If it cannot be listed, we will refund you in full.' || chr(10) ||
      'Express review never changes a score or a ranking.' || chr(10) || chr(10) ||
      'Best regards,' || chr(10) || chr(10) || 'Tony Nelson' || chr(10) || 'Electra Index, published by Dreamotion OÜ' || chr(10) || 'Estonia & Switzerland' || chr(10) || 'contact@electraindex.com', 200);
  end if;
  return case when s.id is null then 'paid_unmatched' else 'ok' end;
end $$;
revoke execute on function express_paid(text, text, text, text) from public;
grant execute on function express_paid(text, text, text, text) to anon, authenticated;

-- requests waiting for review, Express first
create or replace view v_submissions_queue as
select s.created_at::date as received, s.name, s.kind, s.website, s.status,
       case when s.express_paid_at is not null then 'EXPRESS (48 h)' else 'standard' end as review,
       s.express_paid_at
  from submissions s
 where s.status = 'new'
 order by (s.express_paid_at is not null) desc, s.express_paid_at, s.created_at;
revoke all on v_submissions_queue from anon, authenticated;

select * from v_submissions_queue limit 20;
