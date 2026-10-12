-- ELECTRA INDEX — INSTALL_PRICEWATCH_1 : daily price watch robot (agents + payment providers)
-- Paste everything into Supabase > SQL Editor > Run. Installs the robot and its daily schedule (04:20 / 04:35 UTC).
-- It never deletes or rewrites a price: it confirms prices still shown, and flags changes for review.

-- =====================================================================
-- 0020 — Robot "price watch" (100% SQL, pg_net + pg_cron)
--  Every day it re-reads the pricing page of each published agent and
--  payment provider, and keeps a dated fingerprint of the prices shown
--  ($29, €12.50, 2.9 %...).
--   - prices we list are all still on the page  -> confirmed today
--     (price_points.last_confirmed_at moves: "checked" date on the site)
--   - one of our prices is missing from the page -> review queue (price_mismatch)
--   - the page's prices changed since last time  -> review queue (pricing_page_changed)
--   - page gone (404/410)                        -> review queue (pricing_page_gone)
--   - page rendered by JavaScript (no price text) -> noted as "unreadable", nothing changed
--  It never deletes or rewrites a price by itself: a human (or a later
--  extraction step) confirms changes from the review queue.
--  Re-runnable. Two phases because pg_net is asynchronous:
--     select price_watch_dispatch(20);   -- wait ~1 min
--     select price_watch_apply();
-- =====================================================================
create extension if not exists pg_net;

create table if not exists price_watch_checks (
  request_id    bigint primary key,
  entity_id     uuid not null references entities(id) on delete cascade,
  url           text not null,
  dispatched_at timestamptz not null default now(),
  applied       boolean not null default false,
  result        jsonb
);
create index if not exists idx_price_watch_pending on price_watch_checks(applied, dispatched_at);
create index if not exists idx_price_watch_entity on price_watch_checks(entity_id, dispatched_at desc);
alter table price_watch_checks enable row level security;

-- price-like tokens visible in a page: "$29", "$1,200", "€12.50", "2.9%"
create or replace function price_tokens(p_html text) returns text[] language sql immutable as $$
  with t as (
    select regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(coalesce(p_html, ''), '<(script|style|noscript)[^>]*>[\s\S]*?</\1>', ' ', 'gi'),
               '<[^>]+>', ' ', 'g'),
             '&nbsp;|&#160;| ', ' ', 'g'),
           '&#36;|&dollar;', '$', 'g') as txt
  ), t2 as (select replace(replace(replace(txt, '&euro;', '€'), '&pound;', '£'), '&#8364;', '€') as txt from t)
  select coalesce(array_agg(distinct tok order by tok), '{}')
    from (
      select m[1] || regexp_replace(m[2], '[,\s]', '', 'g') as tok
        from t2, regexp_matches(t2.txt, '([$€£])\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)', 'g') m
      union
      select regexp_replace(m[1], '\s', '', 'g') || '%'
        from t2, regexp_matches(t2.txt, '(\d{1,2}(?:\.\d{1,2})?)\s?%', 'g') m
    ) x
   where length(tok) between 2 and 14
$$;

create or replace function price_watch_dispatch(p_batch int default 300, p_stale interval default interval '20 hours')
returns int language plpgsql security definer set search_path = public, net as $$
declare rec record; rid bigint; n int := 0;
begin
  for rec in
    select e.id, e.attributes->'pricing.url'->>'value' as url
      from entities e
     where e.type in ('agent','payment_provider') and e.is_published
       and coalesce(e.attributes->'pricing.url'->>'value', '') ~* '^https?://'
       and not exists (select 1 from price_watch_checks c where c.entity_id = e.id and c.dispatched_at > now() - p_stale)
     order by e.type, e.name
     limit p_batch
  loop
    select net.http_get(url := rec.url,
                        headers := jsonb_build_object('User-Agent', 'ElectraIndexBot/1.0 (+https://electraindex.com/sources)',
                                                      'Accept', 'text/html'),
                        timeout_milliseconds := 20000) into rid;
    insert into price_watch_checks(request_id, entity_id, url) values (rid, rec.id, rec.url) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function price_watch_flag(p_entity uuid, p_reason text, p_payload jsonb) returns void language sql as $$
  insert into review_queue(entity_id, reason, payload)
  select p_entity, p_reason, p_payload
   where not exists (select 1 from review_queue where entity_id = p_entity and reason = p_reason and status = 'open');
$$;

create or replace function price_watch_apply() returns jsonb language plpgsql security definer set search_path = public, net as $$
declare
  rec record; v_tokens text[]; v_prev jsonb; v_hash text; v_missing jsonb; v_ids uuid[]; v_res jsonb;
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
      v_tokens := price_tokens(rec.content);
      if coalesce(array_length(v_tokens, 1), 0) = 0 then
        v_res := v_res || '{"status":"unreadable"}'; n_unread := n_unread + 1;     -- page built by JavaScript
      else
        v_hash := md5(array_to_string(v_tokens, '|'));
        select value into v_prev from observations
         where entity_id = rec.entity_id and field = 'pricing.fingerprint' order by observed_at desc limit 1;
        perform record_observation(rec.entity_id, 'pricing.fingerprint',
                                   jsonb_build_object('hash', v_hash, 'tokens', to_jsonb(v_tokens)),
                                   'observed', 'SRC-049', 'medium', rec.url, null, 'price-watch-v1');
        insert into snapshots(source_id, entity_id, url, http_status, content_type, content_hash, bytes)
        values (v_src, rec.entity_id, rec.url, rec.status_code, 'text/html', v_hash, length(rec.content));

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
            select distinct on (lower(plan_name)) id, amount, currency
              from price_points where entity_id = rec.entity_id
             order by lower(plan_name), observed_at desc
          ), paid as (
            select id, amount, case currency when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' end as sym
              from cur where amount > 0 and currency in ('USD','EUR','GBP')
          ), page as (
            select left(t, 1) as sym, substring(t from 2)::numeric as amount
              from unnest(v_tokens) t where left(t, 1) in ('$','€','£')
          )
          select coalesce(jsonb_agg(paid.sym || trim(trailing '.' from trim(trailing '0' from to_char(paid.amount, 'FM999999990.00'))))
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

revoke execute on function price_watch_dispatch(int, interval) from public, anon, authenticated;
revoke execute on function price_watch_apply() from public, anon, authenticated;
revoke execute on function price_watch_flag(uuid, text, jsonb) from public, anon, authenticated;

-- private report for the SQL Editor
create or replace view v_price_watch as
select e.type, e.slug, e.name, c.url, c.dispatched_at::date as checked_on, c.result->>'status' as status,
       (c.result->>'http')::int as http, c.result->'missing' as missing_on_page,
       (select count(*) from review_queue q where q.entity_id = e.id and q.status = 'open'
          and q.reason in ('price_mismatch','pricing_page_changed','pricing_page_gone')) as open_reviews
  from entities e
  join lateral (select * from price_watch_checks c where c.entity_id = e.id order by c.dispatched_at desc limit 1) c on true;
revoke all on v_price_watch from anon, authenticated;

-- 0021 — daily schedule of the price watch robot (project-specific, needs pg_cron)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in ('electra-price-watch-dispatch','electra-price-watch-apply');
select cron.schedule('electra-price-watch-dispatch', '20 4 * * *', $job$ select price_watch_dispatch(); $job$);
select cron.schedule('electra-price-watch-apply',    '35 4 * * *', $job$ select price_watch_apply();    $job$);

select 'price watch ready' as status,
       (select count(*) from entities where type in ('agent','payment_provider') and is_published and coalesce(attributes->'pricing.url'->>'value','') ~* '^https?://') as pricing_pages_to_watch,
       (select count(*) from cron.job where jobname like 'electra-price-watch%') as scheduled_jobs;
