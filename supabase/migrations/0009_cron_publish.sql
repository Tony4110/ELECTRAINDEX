-- 0009 — keep publication in sync with the robots (every hour at :05)
select cron.unschedule(jobid) from cron.job where jobname = 'intendex-publish';
select cron.schedule('intendex-publish', '5 * * * *', $job$ select publish_entities(); $job$);
