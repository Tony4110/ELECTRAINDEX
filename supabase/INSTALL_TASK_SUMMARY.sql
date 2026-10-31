-- ELECTRA INDEX — INSTALL_TASK_SUMMARY : one line per task for the friendlier Tasks page
--  (how many AI agents can do it, the top 3, the entry price). Read-only view, changes no data.
-- Paste all in Supabase > SQL Editor > Run. Re-runnable.

create or replace view v_task_summary as
select r.task_slug,
       count(*) filter (where r.coverage_pct = 100)                                    as agents_full,
       count(*)                                                                        as agents_any,
       (array_agg(r.provider_name order by r.coverage_pct desc, r.quality_score desc nulls last, r.provider_name))[1:3] as top_agents,
       (array_agg(r.provider_slug order by r.coverage_pct desc, r.quality_score desc nulls last, r.provider_name))[1:3] as top_slugs,
       min(r.from_usd_month) filter (where r.coverage_pct = 100)                        as from_usd_month,
       coalesce(bool_or(r.has_free) filter (where r.coverage_pct = 100), false)         as has_free
  from v_task_rankings r
 where r.provider_type = 'agent'
 group by r.task_slug;
grant select on v_task_summary to anon, authenticated;

select count(*) as tasks, sum(agents_full) as full_matches from v_task_summary;
