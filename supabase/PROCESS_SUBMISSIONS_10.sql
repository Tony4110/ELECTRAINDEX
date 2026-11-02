-- ELECTRA INDEX — PROCESS_SUBMISSIONS_10 : "List your agent" request of 2 Nov 2026
--  PACK AI STUDIO (https://packaistudio.com), submitted as an "app" — NOT LISTED for now:
--   * no pricing page given and no public price found;
--   * no identifiable publisher: contact is a personal Gmail address, no company or country given;
--   * the name is a search-keyword title ("online nutrition label maker"), typical of mass directory submissions.
--  Setting the status to "rejected" sends the standard polite rejection email automatically
--  (criteria, including AI apps, + "submit again if your product changes"). Paste all in Supabase > SQL Editor > Run.

update submissions set status = 'rejected', reviewed_at = now()
 where status = 'new' and website ilike '%packaistudio.com%';

select s.name, s.status,
       (select n.subject from notify_log n where n.kind = 'publisher_rejected' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s
 where s.website ilike '%packaistudio.com%';
