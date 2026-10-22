-- ELECTRA INDEX — REPORT_DEV_PACKS (read-only): developer packs sold and used (keys themselves are never stored)
select created_at::date as sold_on, email, key_prefix, source, credits_used || ' / ' || credits_total as used,
       expires_at::date as expires, last_used_at, revoked
  from api_keys order by created_at desc;
