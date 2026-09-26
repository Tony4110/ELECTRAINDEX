-- 0007 — weekly full re-crawl of the MCP Registry (project-specific, needs pg_cron)
select cron.unschedule(jobid) from cron.job where jobname = 'intendex-mcp-registry-weekly-full';
select cron.schedule('intendex-mcp-registry-weekly-full', '0 3 * * 1',
  $job$ select request_full_recrawl('bot.mcp_registry'); $job$);
