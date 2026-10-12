-- ELECTRA INDEX — INSTALL_TOOLPAGES_2_RECRAWL : start the full re-crawl now (optional)
-- Run ONLY after INSTALL_TOOLPAGES_1 and after the sample pages were checked.
-- Same mechanism as the weekly Monday re-crawl: the robot (every 15 min, 100 s per run,
-- pages of 100 tools) walks the whole registry from the start, saving a cursor after each
-- run so it resumes where it stopped. No effect if a crawl is already in progress.

select request_full_recrawl('bot.mcp_registry');

select value->>'last_complete' is null as full_recrawl_requested,
       coalesce(value->>'cursor', '') <> '' as crawl_in_progress
  from engine_config where key = 'bot.mcp_registry';
