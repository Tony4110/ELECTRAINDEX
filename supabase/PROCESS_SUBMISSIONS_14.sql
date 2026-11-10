-- ELECTRA INDEX — PROCESS_SUBMISSIONS_14 : "List your agent" request of 10 Nov 2026
--  Datacircle (https://datacircle.dev), submitted as a "tool" — NOT LISTED. Read on its site 10 Nov 2026:
--   * a website that benchmarks and compares GTM APIs (a directory, like Electra Index itself), not an AI agent,
--     an MCP server or an AI app — no MCP server of its own;
--   * no company name or country on the site (a privacy policy exists).
--  Setting the status to "rejected" sends the standard polite rejection email automatically, with the reason below
--  if INSTALL_REJECT_REASON.sql has been run. Paste all in Supabase > SQL Editor > Run.

alter table submissions add column if not exists review_note text;

update submissions set status = 'rejected', reviewed_at = now(),
       review_note = 'Datacircle is a website that benchmarks and compares GTM APIs, not an AI agent, an MCP server or an AI app, and the website does not show the company name or country behind it. If you publish an MCP server or an AI agent, you are welcome to submit it.'
 where status = 'new' and website ilike '%datacircle.dev%';

select s.name, s.status,
       (select n.subject from notify_log n where n.kind = 'publisher_rejected' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s
 where s.website ilike '%datacircle.dev%';
