-- 0011 — run the Capability robot continuously (project-specific, needs pg_cron)
-- every 10 min: classify up to 5,000 new providers, then refresh the rankings
select cron.unschedule(jobid) from cron.job where jobname = 'intendex-capabilities';
select cron.schedule('intendex-capabilities', '*/10 * * * *',
  $job$ select classify_capabilities_keywords(5000); select refresh_rankings(); $job$);
