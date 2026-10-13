select cron.unschedule(jobid) from cron.job where jobname = 'electra-capability-tools';
select cron.schedule('electra-capability-tools', '25 * * * *', $job$ select refresh_capability_tools(); $job$);
