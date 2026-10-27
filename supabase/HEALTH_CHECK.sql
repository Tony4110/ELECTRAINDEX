-- ELECTRA INDEX — HEALTH_CHECK : state of the robots and of the monitored data (last 7 days)
-- READ ONLY: changes nothing. Paste all in Supabase > SQL Editor > Run, then export or copy the table.

with jobs as (
  select j.jobname,
         j.active,
         max(d.start_time)                                                         as last_run,
         count(*) filter (where d.start_time > now() - interval '7 days')          as runs_7d,
         count(*) filter (where d.start_time > now() - interval '7 days' and d.status <> 'succeeded') as failed_7d,
         (array_agg(d.status order by d.start_time desc))[1]                       as last_status,
         left((array_agg(d.return_message order by d.start_time desc) filter (where d.status <> 'succeeded'))[1], 120) as last_error
    from cron.job j
    left join cron.job_run_details d on d.jobid = j.jobid
   group by j.jobname, j.active
)
select * from (
  -- 1) every scheduled robot
  select 1 as ord, 'Robot' as section, jobname as item,
         case when not active then 'OFF'
              when last_run is null then 'never ran'
              else 'last run ' || to_char(last_run, 'DD Mon HH24:MI') || ' UTC · ' || last_status
                   || ' · ' || runs_7d || ' runs / ' || failed_7d || ' failed (7d)'
                   || coalesce(' · last error: ' || last_error, '') end as value
    from jobs

  -- 2) what the robots produced
  union all select 2, 'Data', 'Source crawls (7d)',
         count(*) || ' runs · ' || coalesce(sum(items_new), 0) || ' new · ' || coalesce(sum(items_changed), 0) || ' changed · ' || coalesce(sum(errors), 0) || ' errors'
    from crawl_runs where started_at > now() - interval '7 days'
  union all select 2, 'Data', 'MCP live checks (7d)',
         count(*) || ' checks · last ' || coalesce(to_char(max(dispatched_at), 'DD Mon HH24:MI'), '—')
    from mcp_live_checks where dispatched_at > now() - interval '7 days'
  union all select 2, 'Data', 'MCP servers by live status',
         coalesce(string_agg(status || ' ' || n, ' · ' order by n desc), '—')
    from (select status, count(*) n from mcp_live_status group by status) s
  union all select 2, 'Data', 'Price page checks (7d)',
         count(*) || ' checks · last ' || coalesce(to_char(max(dispatched_at), 'DD Mon HH24:MI'), '—')
    from price_watch_checks where dispatched_at > now() - interval '7 days'
  union all select 2, 'Data', 'Changes detected (7d)',
         count(*) || ' · ' || coalesce((select string_agg(event_type || ' ' || n, ', ' order by n desc)
                                          from (select event_type, count(*) n from change_events
                                                 where detected_at > now() - interval '7 days' group by event_type) x), '—')
    from change_events where detected_at > now() - interval '7 days'
  union all select 2, 'Data', 'New entries (7d)',
         coalesce(string_agg(type || ' ' || n, ' · ' order by n desc), '0')
    from (select type, count(*) n from entities where first_seen_at > now() - interval '7 days' group by type) e
  union all select 2, 'Data', 'Published totals',
         (select count(*) from entities where type = 'agent' and is_published) || ' agents · '
      || (select count(*) from entities where type = 'mcp_server' and is_published) || ' MCP servers · '
      || (select count(*) from entity_i18n where lang = 'fr') || ' French descriptions'
  union all select 2, 'Data', 'Weekly Pulse',
         'last edition ' || coalesce((select week || ' (built ' || to_char(built_at, 'DD Mon') || ')' from pulse_editions order by built_at desc limit 1), '—')

  -- 3) visitors and business
  union all select 3, 'Business', 'Outbound clicks (7d)',
         count(*) filter (where human) || ' real visitors · ' || count(*) || ' total (incl. robots) · ' || count(*) filter (where sponsored) || ' sponsored'
    from outbound_clicks where created_at > now() - interval '7 days'
  union all select 3, 'Business', 'Top clicked (7d, real visitors)',
         coalesce((select string_agg(name || ' ' || n, ' · ' order by n desc)
                     from (select e.name, count(*) n from outbound_clicks o join entities e on e.id = o.entity_id
                            where o.created_at > now() - interval '7 days' and o.human
                            group by e.name order by n desc limit 5) t), '—')
  union all select 3, 'Business', 'List-your-agent requests (7d)',
         count(*) || ' · ' || coalesce(string_agg(distinct status, ', '), '—')
    from submissions where created_at > now() - interval '7 days'
  union all select 3, 'Business', 'Monitoring Pro',
         count(*) filter (where status = 'active') || ' active · ' || count(*) filter (where status = 'pending') || ' pending'
    from monitor_subs
  union all select 3, 'Business', 'Launch Spotlight',
         count(*) filter (where status = 'active') || ' active · ' || count(*) filter (where status = 'pending') || ' pending'
    from sponsor_spots
  union all select 3, 'Business', 'Community reports (7d)',
         count(*) || ' · ' || count(*) filter (where status = 'open') || ' still open'
    from community_reports where created_at > now() - interval '7 days'
  union all select 3, 'Business', 'Emails (7d)',
         count(*) filter (where skipped is null) || ' sent · ' || count(*) filter (where skipped is not null) || ' skipped · '
      || coalesce((select string_agg(kind || ' ' || n, ', ' order by n desc)
                     from (select kind, count(*) n from notify_log where created_at > now() - interval '7 days' group by kind) k), '—')
    from notify_log where created_at > now() - interval '7 days'
) r
order by ord, section, item;
