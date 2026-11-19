-- ELECTRA INDEX — CHECK_OUTREACH_2 : how many emails to new MCP servers were sent, and why the others were not.
-- READ ONLY, changes nothing. Paste in Supabase > SQL Editor > Run, then send the table to Claude.
select * from (
  select 1 as n, 'status' as what, status as name, count(*)::text as detail from outreach_mcp group by status
  union all
  select 2, 'sent per day', to_char(sent_at::date, 'YYYY-MM-DD'), count(*)::text
    from outreach_mcp where status = 'sent' group by sent_at::date
  union all
  select 3, 'not sent, reason', coalesce(skip_reason, status), count(*)::text
    from outreach_mcp where status in ('skipped', 'no_email') group by coalesce(skip_reason, status)
  union all
  select 4, 'first and last email', 'first · last', coalesce(min(sent_at)::text, 'none') || ' · ' || coalesce(max(sent_at)::text, 'none')
    from outreach_mcp where status = 'sent'
  union all
  select 5, 'kleap.co', status, coalesce(sent_at::text, '') from outreach_mcp where domain = 'kleap.co'
  union all
  select 6, 'unsubscribed (all time)', 'addresses or domains', count(*)::text from outreach_suppress
) r order by n, name desc;
