-- 0035 — live check: read answers every 2 minutes (harmless when nothing is pending)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-apply';
select cron.schedule('electra-live-check-apply', '*/2 * * * *', $job$ select live_check_apply(); $job$);
