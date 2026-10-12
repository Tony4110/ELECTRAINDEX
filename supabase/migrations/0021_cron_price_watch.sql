-- 0021 — daily schedule of the price watch robot (project-specific, needs pg_cron)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in ('electra-price-watch-dispatch','electra-price-watch-apply');
select cron.schedule('electra-price-watch-dispatch', '20 4 * * *', $job$ select price_watch_dispatch(); $job$);
select cron.schedule('electra-price-watch-apply',    '35 4 * * *', $job$ select price_watch_apply();    $job$);
