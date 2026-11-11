-- ELECTRA INDEX — INSTALL_RESEARCH_LIVE : live figures for the Research page (State of MCP + AI agent prices)
--  * research_daily: one row per day with the day's figures (computed by the database at 04:20 UTC, and now).
--    The page reads only the latest row: instant, never times out, and it builds a real daily history
--    that future reports can use honestly.
--  * Same definitions as the November 2026 report. Nothing else changes.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

create table if not exists research_daily (
  day          date primary key,
  computed_at  timestamptz not null default now(),
  data         jsonb not null
);
alter table research_daily enable row level security;
drop policy if exists research_daily_read on research_daily;
create policy research_daily_read on research_daily for select to anon, authenticated using (true);
grant select on research_daily to anon, authenticated;

create or replace function research_snapshot() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  with
  mcp as (select e.id, (e.attributes->'mcp.remotes') is not null as remote
            from entities e where e.type = 'mcp_server' and e.is_published),
  live as (select s.status, s.tool_count, s.checked_at from mcp_live_status s join mcp m on m.id = s.entity_id),
  ag as (select e.id,
                (select c.slug from relations r join entities c on c.id = r.to_id
                  where r.from_id = e.id and r.relation = 'in_category' and r.valid_to is null limit 1) as theme
           from entities e where e.type = 'agent' and e.is_published),
  ag_min as (select cp.entity_id, min(case when cp.interval = 'year' then cp.amount / 12 else cp.amount end) as usd
               from v_current_prices cp join ag on ag.id = cp.entity_id
              where cp.currency = 'USD' and cp.amount > 0 and cp.interval in ('month','year') group by cp.entity_id),
  ag_free as (select distinct cp.entity_id from v_current_prices cp join ag on ag.id = cp.entity_id
               where cp.billing_model = 'free' or cp.amount = 0),
  themes as (select coalesce(ag.theme, 'other') as theme, count(*) as agents,
                    count(f.entity_id) as free,
                    count(m.entity_id) as priced,
                    percentile_cont(0.5) within group (order by m.usd) as median_usd
               from ag left join ag_free f on f.entity_id = ag.id left join ag_min m on m.entity_id = ag.id
              group by 1)
  select jsonb_build_object(
    'mcp', jsonb_build_object(
      'servers', (select count(*) from mcp),
      'remote', (select count(*) from mcp where remote),
      'tested', (select count(*) from live),
      'online_tools', (select count(*) from live where status = 'online' and coalesce(tool_count,0) > 0),
      'online_no_tools', (select count(*) from live where status = 'online' and coalesce(tool_count,0) = 0),
      'auth', (select count(*) from live where status = 'auth_required'),
      'no_answer', (select count(*) from live where status not in ('online','auth_required')),
      'tools', (select coalesce(sum(tool_count),0) from live where status = 'online'),
      'median_tools', (select percentile_cont(0.5) within group (order by tool_count) from live where status = 'online' and tool_count > 0),
      'checked_24h', (select count(*) from live where checked_at > now() - interval '24 hours'),
      'last_check', (select max(checked_at) from live)),
    'agents', jsonb_build_object(
      'listed', (select count(*) from ag),
      'free', (select count(*) from ag_free),
      'priced', (select count(*) from ag_min),
      'median_usd', (select round(percentile_cont(0.5) within group (order by usd)::numeric, 2) from ag_min),
      'p25_usd', (select round(percentile_cont(0.25) within group (order by usd)::numeric, 2) from ag_min),
      'p75_usd', (select round(percentile_cont(0.75) within group (order by usd)::numeric, 2) from ag_min),
      'last_price_check', (select max(cp.last_confirmed_at) from v_current_prices cp join ag on ag.id = cp.entity_id),
      'themes', (select coalesce(jsonb_agg(jsonb_build_object('theme', theme, 'agents', agents, 'free', free, 'priced', priced,
                                                              'median_usd', round(median_usd::numeric, 2)) order by agents desc), '[]'::jsonb) from themes)))
  into v;

  insert into research_daily (day, computed_at, data) values (current_date, now(), v)
  on conflict (day) do update set computed_at = excluded.computed_at, data = excluded.data;
  return v;
end $$;
revoke execute on function research_snapshot() from public, anon, authenticated;

select research_snapshot();

select cron.unschedule('electra-research-daily') where exists (select 1 from cron.job where jobname = 'electra-research-daily');
select cron.schedule('electra-research-daily', '20 4 * * *', $job$ select research_snapshot(); $job$);

create or replace view v_research_live as
select day, computed_at, data from research_daily order by day desc limit 1;
grant select on v_research_live to anon, authenticated;

select day, computed_at, data->'mcp' as mcp, data->'agents'->>'listed' as agents, data->'agents'->>'median_usd' as median_usd from v_research_live;
