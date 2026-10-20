-- 0040 — Pulse: freeze last week's edition every Monday at 06:10 UTC
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-pulse-weekly';
select cron.schedule('electra-pulse-weekly', '10 6 * * 1', $job$ select pulse_publish(); $job$);
