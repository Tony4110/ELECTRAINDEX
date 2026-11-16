-- ELECTRA INDEX — PROCESS_SUBMISSIONS_23 : "List your agent" request of 16 Nov 2026 — Therefor (AI app)
--  NOT LISTED YET. Checked on therefor.us, 16 Nov 2026:
--   * prices not shown on the home page ("Free to begin", a /pricing link);
--   * no privacy policy linked, although users upload memories and voice recordings of a person;
--   * publisher not identified: no company name, address or country.
--  Same sender as Reeling (listed) and VoiceFleet (not listed for the same identity reason).
--  Status "rejected" sends the standard polite rejection email automatically, with the reason below.
-- Paste all in Supabase > SQL Editor > Run.

alter table submissions add column if not exists review_note text;

update submissions set status = 'rejected', reviewed_at = now(),
       review_note = 'the website does not link a privacy policy, which is essential for an app that receives memories and voice recordings of a person, and it does not show the company behind it (legal name and country). Please also make the prices or free plan visible. Once these are on the website, submit again and we will review it promptly.'
 where status = 'new' and website ilike '%therefor.us%';

select s.name, s.status,
       (select n.subject from notify_log n where n.kind = 'publisher_rejected' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s
 where s.website ilike '%therefor.us%';
