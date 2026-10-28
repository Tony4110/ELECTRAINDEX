-- ELECTRA INDEX — PROCESS_SUBMISSIONS_7 : "List your agent" request of 28 Oct 2026
--  cheapxapi (https://cheapxapi.com), submitted as a "tool" — NOT LISTED. Read on its site 28 Oct 2026:
--   * not an AI agent: a pay-per-call X/Twitter data API ($0.0006 per call) that developers call themselves;
--   * not an MCP server: no MCP endpoint, not in the Official MCP Registry;
--   * no identifiable publisher: no company name or country on the site;
--   * unofficial X data (not affiliated with X Corp) and some calls require the user's X password and 2FA secret.
--  Setting the status to "rejected" sends the standard polite rejection email automatically
--  (criteria + "submit again if your product changes"). Paste all in Supabase > SQL Editor > Run.

update submissions set status = 'rejected', reviewed_at = now()
 where status = 'new' and website ilike '%cheapxapi.com%';

select s.name, s.status,
       (select n.subject from notify_log n where n.kind = 'publisher_rejected' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s
 where s.website ilike '%cheapxapi.com%';
