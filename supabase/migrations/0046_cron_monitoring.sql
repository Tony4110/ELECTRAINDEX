-- 0046 — Monitoring Pro: subscribers' servers checked every 30 minutes (:10 and :40),
--        outage / recovery emails 10 minutes later (:20 and :50), after live_check_apply (every 2 min) has read the answers
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in ('electra-monitor-dispatch', 'electra-monitor-alerts');
select cron.schedule('electra-monitor-dispatch', '10,40 * * * *', $job$ select monitor_dispatch(); $job$);
select cron.schedule('electra-monitor-alerts', '20,50 * * * *', $job$ select monitor_alerts(); $job$);
