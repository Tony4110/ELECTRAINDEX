-- ELECTRA INDEX — INSTALL_PRICEWATCH_3 : read prices split by page markup ("$" and "500" in separate tags)
-- and prices written "500 USD" / "USD 500". Replaces the price reading function only.
-- Paste everything into Supabase > SQL Editor > Run.

-- price-like tokens in a page: "$29", "$1,200", "€12.50", "2.9%"
--   p_visible_only = true : visible text only (scripts and styles removed) -> page fingerprint
--   p_visible_only = false: also prices embedded in the page's data (JavaScript sites often ship them as JSON)
-- note: each removal pattern starts with a lazy quantifier so the whole pattern stays lazy in PostgreSQL
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
        from t2, regexp_matches(t2.txt, '([$€£])\s*(\d+,\d{2}(?![\d,])|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)', 'g') m
      union
      select '$' || regexp_replace(coalesce(m[1], m[2]), ',', '', 'g')
        from t2, regexp_matches(t2.txt, '(?:USD\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?))|(?:(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*USD)', 'g') m
      union
      select regexp_replace(m[1], '\s', '', 'g') || '%'
        from t2, regexp_matches(t2.txt, '(\d{1,2}(?:\.\d{1,2})?)\s?%', 'g') m
       where p_visible_only
    ) x
   where length(tok) between 2 and 14
$$;
drop function if exists price_tokens(text);


select 'price watch v3 ready' as status,
       price_tokens('<span>$</span>
   <span>500</span> USD/Per 100k Credits · from 125 USD · 2.9 %') as self_test;
