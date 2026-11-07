-- ELECTRA INDEX — PROCESS_SUBMISSIONS_13 : "List your agent" request of 7 Nov 2026
--  EGD Agent Grid (https://agentgrid.edensgracedigital.com), submitted as an "agent" — NOT LISTED YET. Read on its site 7 Nov 2026:
--   * not live: the marketplace is "in development", waitlist and early access only (the request says so too);
--   * no public price: providers set their own prices, the marketplace fee percentage is not stated, no free plan;
--   * publisher not identified on the site: footer shows only "© 2026 EGD Agent Grid", no company name or country
--     (a privacy policy exists).
--  Setting the status to "rejected" sends the standard polite rejection email automatically
--  (criteria + "submit again if your product changes"). Paste all in Supabase > SQL Editor > Run.

update submissions set status = 'rejected', reviewed_at = now()
 where status = 'new' and website ilike '%edensgracedigital.com%';

select s.name, s.status,
       (select n.subject from notify_log n where n.kind = 'publisher_rejected' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s
 where s.website ilike '%edensgracedigital.com%';
