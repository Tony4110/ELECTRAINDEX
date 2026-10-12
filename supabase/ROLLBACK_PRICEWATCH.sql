-- ELECTRA INDEX — ROLLBACK_PRICEWATCH : stop the price watch robot (history is kept)
select cron.unschedule(jobid) from cron.job where jobname in ('electra-price-watch-dispatch','electra-price-watch-apply');
drop function if exists price_watch_apply();
drop function if exists price_watch_dispatch(int, interval);
-- optional, removes the robot's own tables and views too:
-- drop view if exists v_price_watch; drop table if exists price_watch_checks; drop function if exists price_watch_flag(uuid, text, jsonb); drop function if exists price_tokens(text);
