-- ELECTRA INDEX — SEND_PUBLISHER_CAMPAIGN : sends the publisher emails to existing contacts (once each).
-- Run INSTALL_PUBLISHER_EMAILS_1 first and check its dry run. Re-running never sends the same email twice.
select * from publisher_campaign(true);
