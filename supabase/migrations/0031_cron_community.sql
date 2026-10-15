select cron.unschedule(jobid) from cron.job where jobname in ('electra-community-recheck', 'electra-community-apply');
select cron.schedule('electra-community-recheck', '40 * * * *', $job$ select community_recheck_dispatch(); $job$);
select cron.schedule('electra-community-apply',   '50 * * * *', $job$ select price_watch_apply(); $job$);
