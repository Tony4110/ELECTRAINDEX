-- ELECTRA INDEX — PROCESS_SUBMISSIONS_9 : "List your agent" request of 30 Oct 2026
--  Unplayable by Shadow Hands (https://app.shadowhands.shop), submitted as an "agent" — NOT LISTED. Read on its site 30 Oct 2026:
--   * consumer self-improvement app (lessons, drills, role-play, chat advisor), not an AI agent that does a job;
--   * no identifiable publisher: no company name, country, terms, privacy policy or contact on the site,
--     although users are asked to upload their private conversations;
--   * no price published.
--  Setting the status to "rejected" sends the standard polite rejection email automatically
--  (criteria + "submit again if your product changes"). Paste all in Supabase > SQL Editor > Run.

update submissions set status = 'rejected', reviewed_at = now()
 where status = 'new' and website ilike '%shadowhands.shop%';

select s.name, s.status,
       (select n.subject from notify_log n where n.kind = 'publisher_rejected' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s
 where s.website ilike '%shadowhands.shop%';
