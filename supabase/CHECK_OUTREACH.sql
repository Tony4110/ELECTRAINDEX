-- ELECTRA INDEX — CHECK_OUTREACH : why no outreach email row yet? (read only, changes nothing)
-- Paste in Supabase > SQL Editor > Run, then send the table to Claude.
select 1 as n, 'job' as what, j.jobname as name, j.schedule || ' · active=' || j.active as detail, null::timestamptz as at
  from cron.job j where j.jobname like 'electra-outreach-%'
union all
select 2, 'last run', j.jobname, d.status || ' · ' || left(coalesce(d.return_message, ''), 160), d.start_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 where j.jobname like 'electra-outreach-%' and d.start_time > now() - interval '2 days'
union all
select 3, 'candidates now', 'new hosted MCP servers (3 days) with a website, online or key required',
       (select count(*) from entities e
         where e.type = 'mcp_server' and e.is_published and e.first_seen_at > now() - interval '3 days'
           and coalesce(nullif(e.website, ''), e.attributes->'website.url'->>'value') ~* '^https?://'
           and exists (select 1 from mcp_live_status l where l.entity_id = e.id and l.status in ('online','auth_required')))::text, null
union all
select 4, 'outreach rows', 'total in outreach_mcp', (select count(*) from outreach_mcp)::text, null
order by n, at desc nulls last;
