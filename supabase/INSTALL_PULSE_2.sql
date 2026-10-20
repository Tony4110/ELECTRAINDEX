-- ELECTRA INDEX — INSTALL_PULSE_2 : Pulse counts only real price updates on existing agents (not the first plans of a new listing, not empty plans), then rebuilds weeks 41-42
-- Paste everything into Supabase > SQL Editor > Run. Re-runnable.

-- =====================================================================
-- 0039 — MCP & Agent Pulse: a weekly edition built from the index itself
--  Every Monday at 06:10 UTC the previous week (Monday 00:00 → Sunday
--  24:00 UTC) is frozen into one edition, with the date the numbers were
--  collected. Nothing is estimated: every figure is a count from our tables.
--    * new MCP servers (first seen that week) and the most notable ones
--    * live check: results so far, servers that stopped answering, back online
--    * agent price changes detected by the price robot
--    * new agents listed
--    * use cases that gained the most new servers
--  Public: v_pulse_editions (read-only). Re-runnable.
-- =====================================================================

create table if not exists pulse_editions (
  week       text primary key,          -- ISO week, e.g. 2026-W42
  week_start date not null,
  data       jsonb not null,
  built_at   timestamptz not null default now()
);
alter table pulse_editions enable row level security;
drop policy if exists pub_read on pulse_editions;
create policy pub_read on pulse_editions for select using (true);
grant select on pulse_editions to anon, authenticated;

create or replace view v_pulse_editions as
select week, week_start, data, built_at from pulse_editions;
grant select on v_pulse_editions to anon, authenticated;

create or replace function pulse_build(p_start date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t0 timestamptz := p_start::timestamptz;
  t1 timestamptz := (p_start + 7)::timestamptz;
  r jsonb;
begin
  with new_srv as (
    select e.id, e.slug, e.name, e.short_description, e.first_seen_at,
           (e.attributes->'transport.remote'->'value')::text::boolean as remote
      from entities e
     where e.type = 'mcp_server' and e.is_published and e.first_seen_at >= t0 and e.first_seen_at < t1
  ), live as (
    select s.*, e.slug, e.name, e.short_description,
           case when s.status in ('online','auth_required') then s.status
                when s.consecutive_failures >= 2 then 'down' else 'unconfirmed' end as shown
      from mcp_live_status s join entities e on e.id = s.entity_id and e.is_published
     where s.checked_at < t1
  ), price_ev as (
    select ev.detected_at, ev.event_type, ev.field, ev.old_value, ev.new_value, e.slug, e.name
      from change_events ev join entities e on e.id = ev.entity_id and e.is_published and e.type = 'agent'
     where ev.is_published and ev.detected_at >= t0 and ev.detected_at < t1
       and ev.event_type in ('price_increase','price_decrease','plan_added','plan_removed','discontinued')
       and e.first_seen_at < t0                                                     -- not the first plans of a newly listed agent
       and not (ev.event_type = 'plan_added' and (ev.new_value->>'amount') is null) -- no empty plan
  ), new_ag as (
    select e.slug, e.name, e.short_description, e.first_seen_at
      from entities e
     where e.type = 'agent' and e.is_published and e.first_seen_at >= t0 and e.first_seen_at < t1
  ), cap_growth as (
    select c.capability_slug, c.capability, count(*) as new_servers
      from mv_capability_tools c join new_srv n on n.id = c.tool_id
     group by 1, 2
  )
  select jsonb_build_object(
    'week', to_char(p_start, 'IYYY-"W"IW'),
    'from', p_start, 'to', p_start + 6,
    'collected_at', now(),
    'totals', jsonb_build_object(
      'servers_listed', (select count(*) from entities where type = 'mcp_server' and is_published and first_seen_at < t1),
      'new_servers', (select count(*) from new_srv),
      'new_hosted', (select count(*) from new_srv where remote),
      'new_versions', (select count(*) from change_events ev join entities e on e.id = ev.entity_id and e.type = 'mcp_server' and e.is_published
                        where ev.event_type = 'new_version' and ev.detected_at >= t0 and ev.detected_at < t1),
      'agents_listed', (select count(*) from entities where type = 'agent' and is_published and first_seen_at < t1),
      'new_agents', (select count(*) from new_ag),
      'price_changes', (select count(*) from price_ev)),
    'live', jsonb_build_object(
      'tested', (select count(*) from live),
      'online', (select count(*) from live where shown = 'online'),
      'auth_required', (select count(*) from live where shown = 'auth_required'),
      'down', (select count(*) from live where shown = 'down'),
      'stopped_answering', (select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
          select jsonb_build_object('slug', slug, 'name', name, 'last_online_at', last_online_at) as x
            from live where shown = 'down' and last_online_at is not null
             and status_changed_at >= t0 and status_changed_at < t1 limit 15) q),
      'back_online', (select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
          select jsonb_build_object('slug', l.slug, 'name', l.name, 'tools', l.tool_count) as x
            from live l where l.shown = 'online' and l.status_changed_at >= t0 and l.status_changed_at < t1
             and exists (select 1 from mcp_live_checks c where c.entity_id = l.entity_id and c.phase = 'init'
                          and c.dispatched_at < l.status_changed_at
                          and coalesce(c.result->>'status', '') not in ('online','auth_required',''))
           limit 15) q),
      'most_tools', (select coalesce(jsonb_agg(x), '[]') from (
          select jsonb_build_object('slug', slug, 'name', name, 'tools', tool_count, 'more', tools_more) as x
            from live where shown = 'online' and tool_count > 0
           order by tool_count desc, name limit 5) q)),
    'new_servers', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('slug', n.slug, 'name', n.name, 'description', left(n.short_description, 240),
                                  'remote', n.remote, 'live', l.shown, 'tools', l.tool_count) as x
          from new_srv n left join live l on l.entity_id = n.id
         where char_length(coalesce(n.short_description, '')) >= 50
         order by (l.shown = 'online') desc nulls last, l.tool_count desc nulls last, n.first_seen_at desc
         limit 12) q),
    'prices', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
        select jsonb_build_object('slug', slug, 'name', name, 'event', event_type, 'field', field,
                                  'old', old_value, 'new', new_value, 'at', detected_at) as x
          from price_ev limit 20) q),
    'new_agents', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('slug', slug, 'name', name, 'description', left(short_description, 240)) as x
          from new_ag order by first_seen_at desc limit 12) q),
    'use_cases', (select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object('slug', capability_slug, 'name', capability, 'new_servers', new_servers) as x
          from cap_growth order by new_servers desc, capability limit 8) q)
  ) into r;
  return r;
end $$;
revoke execute on function pulse_build(date) from public, anon, authenticated;

-- freeze an edition (default: the week that ended last Sunday)
create or replace function pulse_publish(p_start date default (date_trunc('week', now() at time zone 'utc')::date - 7))
returns text language plpgsql security definer set search_path = public as $$
declare v_start date := date_trunc('week', p_start)::date; v_week text := to_char(v_start, 'IYYY-"W"IW');
begin
  insert into pulse_editions(week, week_start, data, built_at)
  values (v_week, v_start, pulse_build(v_start), now())
  on conflict (week) do update set data = excluded.data, built_at = now();
  return v_week;
end $$;
revoke execute on function pulse_publish(date) from public, anon, authenticated;

select pulse_publish('2026-10-05');
select pulse_publish('2026-10-12');
select week, data->'totals'->>'new_servers' as new_servers, data->'totals'->>'new_agents' as new_agents,
       data->'totals'->>'price_changes' as price_updates, data->'live'->>'tested' as live_tested
  from pulse_editions order by week;
