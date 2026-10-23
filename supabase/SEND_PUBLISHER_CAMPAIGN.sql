-- ELECTRA INDEX — SEND_PUBLISHER_CAMPAIGN : sends the publisher emails to existing contacts (once each),
-- 8 per run (Resend accepts 10 per second). If some lines say "next batch", wait a few seconds and run again.
-- Dry run first: select * from publisher_campaign(false);
select * from publisher_campaign(true);
