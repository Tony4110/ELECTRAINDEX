-- 0036 — live check: send a batch every 30 minutes (300 servers, max 3 per host, each server every 3 days)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-dispatch';
select cron.schedule('electra-live-check-dispatch', '5,35 * * * *', $job$ select live_check_dispatch(300); $job$);
