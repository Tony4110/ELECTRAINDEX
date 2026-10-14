-- =====================================================================
-- 0026 — Price corrections support + price watch fixes
--  * price_points.discontinued: a plan the vendor no longer offers is closed
--    by appending a "discontinued" row (history kept, append-only). Current
--    prices (v_current_prices) skip closed plans.
--  * discontinue_price(entity, plan): closes a plan, logs a plan_removed event.
--  * resolve_price_reviews(entity): closes the robot's open price reviews.
--  * Price watch: amounts with 3-4 decimals ($0.008, $0.012) were rounded to
--    2 decimals and reported as missing (false alarms). Fixed on both sides.
--    Euro amounts written after the number ("20€/mo", n8n) are now read too.
--    Closed plans are no longer checked.
-- =====================================================================
alter table price_points add column if not exists discontinued boolean not null default false;

create or replace view v_current_prices with (security_invoker = true) as
select entity_id, plan_name, billing_model, amount, currency, interval, unit,
       is_trial, evidence_level, observed_at, last_confirmed_at, source_name
  from (select distinct on (p.entity_id, lower(p.plan_name))
               p.entity_id, p.plan_name, p.billing_model, p.amount, p.currency, p.interval, p.unit,
               p.is_trial, p.evidence_level, p.observed_at, p.last_confirmed_at, s.name as source_name, p.discontinued
          from price_points p join sources s on s.id = p.source_id
         order by p.entity_id, lower(p.plan_name), p.observed_at desc) x
 where not x.discontinued;

create or replace function discontinue_price(p_entity_id uuid, p_plan text, p_source_code text, p_evidence_url text default null)
returns text language plpgsql as $$
declare v_prev price_points%rowtype; v_id uuid;
begin
  select * into v_prev from price_points where entity_id = p_entity_id and lower(plan_name) = lower(p_plan)
   order by observed_at desc limit 1;
  if v_prev.id is null or v_prev.discontinued then return 'nothing to close: ' || p_plan; end if;
  insert into price_points(entity_id, plan_name, billing_model, amount, currency, interval, unit, is_trial,
                           evidence_level, source_id, evidence_url, discontinued)
  values (p_entity_id, v_prev.plan_name, v_prev.billing_model, v_prev.amount, v_prev.currency, v_prev.interval, v_prev.unit,
          v_prev.is_trial, 'observed', source_id_of(p_source_code), p_evidence_url, true)
  returning id into v_id;
  insert into change_events(entity_id, event_type, field, old_value, source_id, price_point_id, importance)
  values (p_entity_id, 'plan_removed', 'price.' || slugify(v_prev.plan_name),
          jsonb_build_object('amount', v_prev.amount, 'currency', v_prev.currency, 'interval', v_prev.interval),
          source_id_of(p_source_code), v_id, 3);
  return 'closed: ' || v_prev.plan_name;
end $$;

create or replace function resolve_price_reviews(p_entity_id uuid) returns int language sql as $$
  with u as (update review_queue set status = 'done', resolved_at = now()
              where entity_id = p_entity_id and status = 'open'
                and reason in ('price_mismatch', 'pricing_page_changed', 'pricing_page_gone') returning 1)
  select count(*)::int from u;
$$;
revoke execute on function discontinue_price(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function resolve_price_reviews(uuid) from public, anon, authenticated;

create or replace function price_tokens(p_html text, p_visible_only boolean default true) returns text[] language sql immutable as $$
  with t0 as (
    select case when p_visible_only then
             regexp_replace(regexp_replace(regexp_replace(coalesce(p_html, ''),
               '<script.*?</script>', ' ', 'gi'), '<style.*?</style>', ' ', 'gi'), '<noscript.*?</noscript>', ' ', 'gi')
           else replace(replace(coalesce(p_html, ''), '\u0024', '$'), '\u20ac', '€') end as txt
  ), t as (
    select regexp_replace(regexp_replace(regexp_replace(txt, '<[^>]+>', ' ', 'g'),
             '&nbsp;|&#160;|\u00a0', ' ', 'g'), '&#36;|&dollar;', '$', 'g') as txt from t0
  ), t2 as (select regexp_replace(replace(replace(replace(txt, '&euro;', '€'), '&pound;', '£'), '&#8364;', '€'), '\s+', ' ', 'g') as txt from t)
  select coalesce(array_agg(distinct tok order by tok), '{}')
    from (
      select m[1] || case when m[2] ~ '^\d+,\d{2}$' then replace(m[2], ',', '.') else regexp_replace(m[2], '[,\s]', '', 'g') end as tok
        from t2, regexp_matches(t2.txt, '([$€£])\s*(\d+,\d{2}(?![\d,])|\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)', 'g') m
      union
      select '$' || regexp_replace(coalesce(m[1], m[2]), ',', '', 'g')
        from t2, regexp_matches(t2.txt, '(?:USD\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?))|(?:(\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?)\s*USD)', 'g') m
      union
      select '€' || replace(m[1], ',', '.')                      -- "20€", "667 €", "24,99€" (amount before the sign)
        from t2, regexp_matches(t2.txt, '(?<![\d.,])(\d+(?:,\d{2})?)\s?€', 'g') m
      union
      select regexp_replace(m[1], '\s', '', 'g') || '%'
        from t2, regexp_matches(t2.txt, '(\d{1,2}(?:\.\d{1,4})?)\s?%', 'g') m
       where p_visible_only
    ) x
   where length(tok) between 2 and 14
$$;

create or replace function price_watch_apply() returns jsonb language plpgsql security definer set search_path = public, net as $$
declare
  rec record; v_tokens text[]; v_all text[]; v_prev jsonb; v_hash text; v_missing jsonb; v_ids uuid[]; v_res jsonb;
  n_conf int := 0; n_mis int := 0; n_chg int := 0; n_gone int := 0; n_unread int := 0; n_skip int := 0;
  v_src uuid := source_id_of('SRC-049');
begin
  for rec in
    select c.request_id, c.entity_id, c.url, e.type, r.status_code, r.content
      from price_watch_checks c
      join entities e on e.id = c.entity_id
      join net._http_response r on r.id = c.request_id
     where not c.applied and r.status_code is not null
  loop
    v_res := jsonb_build_object('http', rec.status_code);
    if rec.status_code in (404, 410) then
      perform price_watch_flag(rec.entity_id, 'pricing_page_gone', jsonb_build_object('url', rec.url, 'http', rec.status_code));
      v_res := v_res || '{"status":"gone"}'; n_gone := n_gone + 1;

    elsif rec.status_code between 200 and 299 then
      v_tokens := price_tokens(rec.content, true);
      v_all := price_tokens(rec.content, false);
      if coalesce(array_length(v_tokens, 1), 0) = 0 and coalesce(array_length(v_all, 1), 0) = 0 then
        v_res := v_res || '{"status":"unreadable"}'; n_unread := n_unread + 1;     -- no price anywhere in the HTML
      else
        v_hash := md5(array_to_string(coalesce(nullif(v_tokens, '{}'), v_all), '|'));
        select value into v_prev from observations
         where entity_id = rec.entity_id and field = 'pricing.fingerprint' order by observed_at desc limit 1;
        perform record_observation(rec.entity_id, 'pricing.fingerprint',
                                   jsonb_build_object('hash', v_hash, 'tokens', to_jsonb(coalesce(nullif(v_tokens, '{}'), v_all))),
                                   'observed', 'SRC-049', 'medium', rec.url, null, 'price-watch-v1');
        insert into snapshots(source_id, entity_id, url, http_status, content_type, content_hash, bytes)
        values (v_src, rec.entity_id, rec.url, rec.status_code, 'text/html', v_hash, length(rec.content));

        v_tokens := coalesce(nullif(v_tokens, '{}'), v_all);
        if v_prev is not null and v_prev->>'hash' <> v_hash then
          perform price_watch_flag(rec.entity_id, 'pricing_page_changed',
            jsonb_build_object('url', rec.url, 'added',
              (select coalesce(jsonb_agg(x), '[]') from unnest(v_tokens) x where not (v_prev->'tokens') ? x),
              'removed', (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements_text(v_prev->'tokens') x where not x = any(v_tokens))));
          n_chg := n_chg + 1;
        end if;

        if rec.type = 'agent' then
          -- our current paid prices: is each one still visible on the page (same currency, same amount)?
          with cur as (
            select id, amount, currency from (
              select distinct on (lower(plan_name)) id, amount, currency, discontinued
                from price_points where entity_id = rec.entity_id
               order by lower(plan_name), observed_at desc) z
             where not z.discontinued
          ), paid as (
            select id, amount, case currency when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' end as sym
              from cur where amount > 0 and currency in ('USD','EUR','GBP')
          ), page as (
            select left(t, 1) as sym, substring(t from 2)::numeric as amount
              from unnest(v_tokens || v_all) t where left(t, 1) in ('$','€','£')
          )
          select coalesce(jsonb_agg(paid.sym || trim(trailing '.' from trim(trailing '0' from to_char(paid.amount, 'FM999999990.0000'))))
                            filter (where not exists (select 1 from page where page.sym = paid.sym and page.amount = paid.amount)), '[]'),
                 array_agg(paid.id)
            into v_missing, v_ids from paid;
          if v_ids is null then
            v_res := v_res || '{"status":"no_paid_price"}';
          elsif jsonb_array_length(v_missing) = 0 then
            update price_points set last_confirmed_at = now() where id = any(v_ids);
            update entities set last_verified_at = now() where id = rec.entity_id;
            v_res := v_res || '{"status":"confirmed"}'; n_conf := n_conf + 1;
          else
            perform price_watch_flag(rec.entity_id, 'price_mismatch', jsonb_build_object('url', rec.url, 'missing_on_page', v_missing));
            v_res := v_res || jsonb_build_object('status', 'mismatch', 'missing', v_missing); n_mis := n_mis + 1;
          end if;
        else
          v_res := v_res || '{"status":"read"}';
        end if;
      end if;
    else
      v_res := v_res || '{"status":"skipped"}'; n_skip := n_skip + 1;   -- 403/429/5xx: try again tomorrow
    end if;
    update price_watch_checks set applied = true, result = v_res where request_id = rec.request_id;
  end loop;
  return jsonb_build_object('confirmed', n_conf, 'mismatch', n_mis, 'changed', n_chg, 'gone', n_gone,
                            'unreadable', n_unread, 'skipped', n_skip);
end $$;
revoke execute on function price_watch_apply() from public, anon, authenticated;
