-- ELECTRA INDEX — PROCESS_SUBMISSIONS_21 : "List your agent" request of 16 Nov 2026 — VoiceFleet (agent, Customer Support)
--  NOT LISTED YET. Checked 16 Nov 2026:
--   * live, public prices: Starter EUR 99/month, Growth EUR 299, Pro EUR 599, 7-day free trial (voicefleet.ai/pricing);
--   * privacy policy: voicefleet.ai/privacy;
--   * publisher not identified: footer shows only "© 2026 VoiceFleet", no company name, registered address or country
--     on the website (nor on its Capterra page).
--  Status "rejected" sends the standard polite rejection email automatically, with the reason below
--  (what we found + "submit again once fixed"). Paste all in Supabase > SQL Editor > Run.

alter table submissions add column if not exists review_note text;

update submissions set status = 'rejected', reviewed_at = now(),
       review_note = 'VoiceFleet itself meets our criteria (live product, public prices, privacy policy), but the website does not show the company behind it: no legal company name and no country, only "© 2026 VoiceFleet" in the footer. Add them to your website (footer, terms or about page), then submit again: we will list it right away.'
 where status = 'new' and website ilike '%voicefleet.ai%';

select s.name, s.status,
       (select n.subject from notify_log n where n.kind = 'publisher_rejected' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s
 where s.website ilike '%voicefleet.ai%';
