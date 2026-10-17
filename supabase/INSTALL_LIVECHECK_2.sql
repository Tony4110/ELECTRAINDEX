-- ELECTRA INDEX — INSTALL_LIVECHECK_2 : switch on the automatic live check (every 30 min, 300 servers, max 3 per host)
-- Run only after REPORT_LIVECHECK.sql looked right. Stop at any time with:
--   select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-dispatch';

-- 0036 — live check: send a batch every 30 minutes (300 servers, max 3 per host, each server every 3 days)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-dispatch';
select cron.schedule('electra-live-check-dispatch', '5,35 * * * *', $job$ select live_check_dispatch(300); $job$);
select jobname, schedule from cron.job where jobname like 'electra-live-check-%' order by 1;
