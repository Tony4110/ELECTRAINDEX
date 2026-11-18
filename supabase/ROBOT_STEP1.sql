-- ELECTRA INDEX — ROBOT_STEP1 : re-test each hosted MCP server about every 2 days instead of 3
--  Why (CHECK_ROBOT_CAPACITY, 18 Nov 2026): the robot is not short of capacity. It stops because only servers
--  last tested 3+ days ago may be picked (73 of 336 runs sent fewer than 100 servers; 0 request lost).
--  Step 1: a server may be re-tested after 2 days, and each run may send up to 450 servers (was 300).
--  Unchanged: at most 3 servers per host per run (politeness), same 15 s timeout, same requests.
--  Watch for 48 h with CHECK_ROBOT_CAPACITY.sql (lost requests, timeouts, failures). Undo: see the end.
-- Paste everything in Supabase > SQL Editor > Run.

select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-dispatch';
select cron.schedule('electra-live-check-dispatch', '5,35 * * * *', $job$ select live_check_dispatch(450, interval '2 days'); $job$);
select jobname, schedule, command from cron.job where jobname = 'electra-live-check-dispatch';

-- UNDO (back to every 3 days, 300 per run): run only these two lines
-- select cron.unschedule(jobid) from cron.job where jobname = 'electra-live-check-dispatch';
-- select cron.schedule('electra-live-check-dispatch', '5,35 * * * *', $job$ select live_check_dispatch(300); $job$);
