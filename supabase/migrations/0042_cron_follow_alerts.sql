-- 0042 — follow alerts: hourly digest at :15
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-follow-alerts';
select cron.schedule('electra-follow-alerts', '15 * * * *', $job$ select follow_alerts_dispatch(); $job$);
