-- ELECTRA INDEX — TEST_PRICEWATCH : run by hand on 20 pages
-- Run PART 1, wait ~1-2 minutes, then run PART 2 (remove the two leading dashes of each line).

-- PART 1 — send 20 requests (the 0 interval re-checks pages already checked today)
select price_watch_dispatch(20, interval '0') as pages_requested;

-- PART 2 — read the answers
-- select price_watch_apply();
-- select type, name, status, http, missing_on_page from v_price_watch order by status, name;
