-- ELECTRA INDEX — TEST_PRICEWATCH : first run by hand on 20 pages
-- Run PART 1, wait ~1 minute, then run PART 2.

-- PART 1 — send 20 requests
select price_watch_dispatch(20) as pages_requested;

-- PART 2 — read the answers (run this ~1 minute later)
-- select price_watch_apply();
-- select type, name, status, http, missing_on_page, open_reviews from v_price_watch order by status, name;
