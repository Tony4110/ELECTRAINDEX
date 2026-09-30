-- 0013 — Capability robot cron now runs kw-v2 (project-specific, needs pg_cron)
select cron.unschedule(jobid) from cron.job where jobname = 'intendex-capabilities';
select cron.schedule('intendex-capabilities', '*/10 * * * *',
  $job$ select classify_capabilities_keywords(5000, 'kw-v2'); select refresh_rankings(); $job$);

