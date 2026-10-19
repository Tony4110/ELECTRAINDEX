-- ELECTRA INDEX — CHECK_NOTIFY (read-only): last notifications and Resend's answer
select l.created_at, l.kind, l.subject, coalesce(l.skipped, 'sent') as result,
       r.status_code as resend_http, left(r.content, 160) as resend_answer
  from notify_log l left join net._http_response r on r.id = l.request_id
 order by l.id desc limit 10;
