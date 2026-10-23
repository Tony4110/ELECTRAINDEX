-- 0050 — Launch Spotlight: daily reports, end of runs and free extensions (07:20 UTC)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-spotlight-tick';
select cron.schedule('electra-spotlight-tick', '20 7 * * *', $job$ select spotlight_tick(); $job$);
