-- =====================================================================
-- 0005 — Scheduling (project-specific: Intendex Supabase project)
-- Calls the Edge Function every 15 minutes. The first full crawl
-- (~30k servers) completes over a few runs; afterwards each run only
-- fetches servers updated since the last complete crawl.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'intendex-discovery-mcp-registry';

select cron.schedule(
  'intendex-discovery-mcp-registry',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url     := 'https://rqgnjavfbahderwxykox.supabase.co/functions/v1/discovery-mcp-registry',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $job$
);
