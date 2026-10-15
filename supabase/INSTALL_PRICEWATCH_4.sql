-- ELECTRA INDEX — INSTALL_PRICEWATCH_4 : fewer false alarms + cleanup. Paste into SQL Editor > Run.

-- =====================================================================
-- 0027 — Price watch v4 (fewer false alarms)
--  * Reads amounts written without a leading zero ("$.012/credit", Qodo).
--  * No "price_mismatch" when the prices cannot be read in the page HTML
--    (monthly/annual toggle, slider, script) BUT were confirmed less than
--    30 days ago and the page has not changed since. After 30 days, or as
--    soon as the page changes, the check applies again.
--  * One-time cleanup: the 0026 reading fix changed every page fingerprint
--    on 15 Oct; reviews where the only difference is the new reading
--    ($0.12 -> $0.125, '20€' now read) are closed. Real changes stay open.
-- =====================================================================
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
      select m[1] || case when m[2] ~ '^\d+,\d{2}$' then replace(m[2], ',', '.') when left(m[2], 1) = '.' then '0' || m[2] else regexp_replace(m[2], '[,\s]', '', 'g') end as tok
        from t2, regexp_matches(t2.txt, '([$€£])\s*(\d+,\d{2}(?![\d,])|\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d+(?:\.\d{1,4})?|\.\d{1,4})', 'g') m
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
          elsif v_prev is not null and v_prev->>'hash' = v_hash
                and not exists (select 1 from price_points pp where pp.id = any(v_ids) and pp.last_confirmed_at < now() - interval '30 days') then
            -- prices not readable in the page HTML (toggle, slider, script), but confirmed less than 30 days ago
            -- and the page has not changed since: no alert
            v_res := v_res || jsonb_build_object('status', 'not_readable_recently_confirmed', 'missing', v_missing);
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

-- one-time cleanup of format-only "page changed" reviews
update review_queue q set status = 'done', resolved_at = now()
 where q.status = 'open' and q.reason = 'pricing_page_changed'
   and not exists (   -- every removed token is just a shorter reading of an added one
     select 1 from jsonb_array_elements_text(coalesce(q.payload->'removed', '[]')) r
      where r not in ('$0.00', '05%')
        and not exists (select 1 from jsonb_array_elements_text(coalesce(q.payload->'added', '[]')) a where a like r || '_%'))
   and not exists (   -- every added token is a newly readable form (3-4 decimals, euro after the number) or a longer reading
     select 1 from jsonb_array_elements_text(coalesce(q.payload->'added', '[]')) a
      where not (a ~ '\.\d{3,4}%?$' or left(a, 1) = '€'
                 or exists (select 1 from jsonb_array_elements_text(coalesce(q.payload->'removed', '[]')) r where a like r || '_%')));

-- reviews already checked by hand on 14 Oct (prices confirmed on the vendor page)
update review_queue q set status = 'done', resolved_at = now()
  from entities e
 where e.id = q.entity_id and q.status = 'open'
   and q.reason in ('price_mismatch', 'pricing_page_gone')
   and e.name in ('Qodo', 'Spark Mail', 'Superhuman Mail', 'Otter.ai', 'Gemini Deep Research', 'Fin AI Agent',
                  'Lovable', 'Surfer', 'Notion Agent', 'Tavily', 'Kosmos', 'n8n', 'Exa', 'Dust');

select q.reason, e.name, q.payload->'added' as added, q.payload->'removed' as removed, coalesce(q.payload->'missing_on_page', 'null') as missing
  from review_queue q join entities e on e.id = q.entity_id
 where q.status = 'open' order by q.reason, e.name;
