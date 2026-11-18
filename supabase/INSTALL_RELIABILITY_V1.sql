-- ELECTRA INDEX — INSTALL_RELIABILITY_V1 : Reliability Intelligence, livraison 1
--  One shared calculation of "observed availability" for the whole site:
--   * mcp_check_class(): what each check result counts as (rule B, validated 18 Nov 2026)
--       online                                   -> answer, open access
--       auth_required (401, 403, auth error)     -> answer, protected access (alive, never an outage)
--       timeout, unreachable, 5xx, invalid MCP,
--       404/405/410, non-MCP 2xx page             -> failure
--       429 (we were rate limited), non-MCP reply
--       with another HTTP code (400, 406, 3xx...) -> excluded until reviewed
--       check inside a 30-min window where 80%+ of 50+ checks failed (our own incident) -> excluded
--   * mcp_obs(): observed availability = answers / (answers + failures), shown only from 10 conclusive checks.
--     Used by get_mcp_server_history (paid), the MCP tool search, the Monitoring Pro report and badge,
--     and the new public block on each MCP page. No other formula remains.
--   * mcp_public_reliability(): what an MCP page shows (30 days, one mark per check, confirmed tool changes).
--   * capability_overview_cache: /mcp/best precomputed every hour; a failed refresh keeps the last good data.
--  No 90-day public figure, no version changes, no probable renames in this delivery.
--  Nothing is deleted: the check history and tool records are only read.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable. Undo: ROLLBACK_RELIABILITY_V1.sql

-- ---------------------------------------------------------------------
-- 1. How each check counts
-- ---------------------------------------------------------------------
create or replace function mcp_check_class(p_status text, p_http int) returns text
language sql immutable as $$
  select case
    when p_status = 'online' then 'open'
    when p_status = 'auth_required' then 'protected'
    when p_http = 429 then 'excluded'
    when p_status = 'not_mcp' and p_http is not null and p_http not between 200 and 299 then 'excluded'
    when p_status in ('timeout', 'unreachable', 'error', 'not_found', 'not_mcp') then 'failure'
    else 'excluded'
  end
$$;

-- the 30-minute window a check belongs to (the robot runs at :05 and :35)
create or replace function mcp_window(p_at timestamptz) returns timestamptz
language sql immutable as $$ select to_timestamp(floor(extract(epoch from p_at) / 1800) * 1800) $$;

-- windows where most checks failed at once: almost certainly a problem on our side, not the servers'
create table if not exists mcp_check_incidents (
  window_start timestamptz primary key,
  checks       int not null,
  failed       int not null,
  found_at     timestamptz not null default now()
);
alter table mcp_check_incidents enable row level security;   -- private

create or replace function refresh_mcp_check_incidents(p_since interval default interval '3 hours') returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into mcp_check_incidents(window_start, checks, failed)
  select mcp_window(checked_at), count(*), count(*) filter (where mcp_check_class(status, http) = 'failure')
    from mcp_live_history
   where checked_at > now() - p_since
   group by 1
  having count(*) >= 50 and count(*) filter (where mcp_check_class(status, http) = 'failure') >= 0.8 * count(*)
  on conflict (window_start) do update set checks = excluded.checks, failed = excluded.failed;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function refresh_mcp_check_incidents(interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. The one shared calculation
-- ---------------------------------------------------------------------
create or replace function mcp_obs(p_entity uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(coalesce(p_days, 30), 1), 365); r jsonb;
begin
  with h as (
    select x.checked_at,
           case when exists (select 1 from mcp_check_incidents i where i.window_start = mcp_window(x.checked_at)) then 'excluded'
                else mcp_check_class(x.status, x.http) end as cls
      from mcp_live_history x
     where x.entity_id = p_entity and x.checked_at > now() - make_interval(days => v_days)
  ), c as (
    select count(*) as checks,
           count(*) filter (where cls <> 'excluded') as conclusive,
           count(*) filter (where cls in ('open', 'protected')) as answers,
           count(*) filter (where cls = 'open') as open,
           count(*) filter (where cls = 'protected') as protected,
           count(*) filter (where cls = 'failure') as failures,
           count(*) filter (where cls = 'excluded') as excluded,
           min(checked_at) as first_check, max(checked_at) as last_check,
           (array_agg(cls order by checked_at desc) filter (where cls in ('open', 'protected')))[1] as access
      from h
  )
  select jsonb_build_object(
           'days', v_days, 'checks', checks, 'conclusive', conclusive, 'answers', answers,
           'open', open, 'protected', protected, 'failures', failures, 'excluded', excluded,
           'rate', case when conclusive > 0 then round(100.0 * answers / conclusive, 1) end,
           'availability', case when conclusive >= 10 then round(100.0 * answers / conclusive, 1) end,
           'min_checks', 10, 'access', access, 'first_check', first_check, 'last_check', last_check)
    into r from c;
  return r;
end $$;
revoke execute on function mcp_obs(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Paid history (get_mcp_server_history) and Monitoring Pro: same contract, now on the shared calculation
-- ---------------------------------------------------------------------
create or replace function server_history_data(p_entity uuid, p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(coalesce(p_days, 90), 1), 365); r jsonb; v_slug text; v_name text; o jsonb;
begin
  select slug, name into v_slug, v_name from entities where id = p_entity;
  if v_slug is null then return null; end if;
  o := mcp_obs(p_entity, v_days);
  with h as (
    select checked_at, status, http, tool_count, protocol_version,
           case when exists (select 1 from mcp_check_incidents i where i.window_start = mcp_window(checked_at)) then 'excluded'
                else mcp_check_class(status, http) end as cls,
           lag(status) over (order by checked_at) as prev
      from mcp_live_history
     where entity_id = p_entity and checked_at > now() - make_interval(days => v_days)
  )
  select jsonb_build_object(
    'slug', v_slug, 'name', v_name, 'days', v_days,
    'checks', (o->>'checks')::int,
    'conclusive', (o->>'conclusive')::int,
    'answered', (o->>'answers')::int,
    'answer_rate', (o->>'rate')::numeric,
    'availability', (o->>'availability')::numeric,
    'open', (o->>'open')::int, 'protected', (o->>'protected')::int,
    'failures', (o->>'failures')::int, 'excluded', (o->>'excluded')::int,
    'access', o->>'access',
    'first_check', o->'first_check',
    'last_check', o->'last_check',
    'last_online', (select max(checked_at) from h where status = 'online'),
    'transitions', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'from', prev, 'to', status) order by checked_at), '[]')
                      from h where prev is not null and prev is distinct from status),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'status', status, 'class', cls, 'http', http, 'tools', tool_count, 'protocol', protocol_version) order by checked_at desc), '[]')
                   from (select * from h order by checked_at desc limit 200) t),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('at', detected_at, 'from', old_value, 'to', new_value) order by detected_at desc), '[]')
                   from change_events where entity_id = p_entity and event_type = 'new_version' and is_published
                    and detected_at > now() - make_interval(days => v_days)),
    'method', 'Observed availability = answers / (answers + failures). A request for a key or sign-in is an answer (protected access), never an outage. Timeouts, unreachable endpoints, server errors and invalid MCP replies are failures. Rate-limited (429) checks, unclassified non-MCP replies and checks during our own incidents are excluded. "availability" is null under 10 conclusive checks. Observed at each check, not continuous uptime; not a guarantee of security, quality or future availability.'
  ) into r;
  return r;
end $$;
revoke execute on function server_history_data(uuid, int) from public, anon, authenticated;

-- badge: the 30-day figure (Monitoring Pro only, unchanged display) now comes from the shared calculation
create or replace function monitor_badge(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_pro boolean; r jsonb;
begin
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = p_slug;
  if v_id is null then return null; end if;
  v_pro := exists (select 1 from monitor_subs where entity_id = v_id and status = 'active');
  select jsonb_build_object(
           'status', case when l.status in ('online','auth_required') then l.status
                          when l.consecutive_failures >= 2 then 'down' else 'unconfirmed' end,
           'checked_at', l.checked_at, 'pro', v_pro,
           'rate30', case when v_pro then (mcp_obs(v_id, 30)->>'availability')::numeric end)
    into r from mcp_live_status l where l.entity_id = v_id;
  return coalesce(r, jsonb_build_object('status', 'unchecked', 'pro', v_pro));
end $$;
revoke execute on function monitor_badge(text) from public;
grant execute on function monitor_badge(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Confirmed tool changes for one server
--    added   = first seen after this server's first tool list (+1 h margin)
--    removed = missing from the latest list in which this server's tools were seen
--    nothing is claimed when the list is partial (more than 100 tools, or paged)
-- ---------------------------------------------------------------------
create or replace function mcp_tool_changes(p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_partial boolean; v_base timestamptz; v_last timestamptz; v_n int;
begin
  select min(first_seen_at), max(last_seen_at), count(*) into v_base, v_last, v_n from mcp_tools where entity_id = p_entity;
  if coalesce(v_n, 0) = 0 then return jsonb_build_object('tracked', false); end if;
  select coalesce(tools_more, false) or coalesce(tool_count, 0) > 100 into v_partial from mcp_live_status where entity_id = p_entity;
  if coalesce(v_partial, false) then
    return jsonb_build_object('tracked', true, 'since', v_base, 'partial', true, 'tools', v_n);
  end if;
  return jsonb_build_object(
    'tracked', true, 'since', v_base, 'partial', false, 'last_list', v_last,
    'tools', (select count(*) from mcp_tools where entity_id = p_entity and last_seen_at >= v_last - interval '1 hour'),
    'added_count', (select count(*) from mcp_tools where entity_id = p_entity and first_seen_at > v_base + interval '1 hour'),
    'removed_count', (select count(*) from mcp_tools where entity_id = p_entity and last_seen_at < v_last - interval '1 hour'),
    'added', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'at', first_seen_at) order by first_seen_at desc, name), '[]')
                from (select name, first_seen_at from mcp_tools where entity_id = p_entity and first_seen_at > v_base + interval '1 hour'
                       order by first_seen_at desc, name limit 20) a),
    'removed', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'last_seen', last_seen_at) order by last_seen_at desc, name), '[]')
                  from (select name, last_seen_at from mcp_tools where entity_id = p_entity and last_seen_at < v_last - interval '1 hour'
                         order by last_seen_at desc, name limit 20) d));
end $$;
revoke execute on function mcp_tool_changes(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. What a public MCP page shows (read-only, public data)
-- ---------------------------------------------------------------------
create or replace function mcp_public_reliability(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_pro boolean;
begin
  select id into v_id from entities where type = 'mcp_server' and is_published and slug = p_slug;
  if v_id is null then return null; end if;
  v_pro := exists (select 1 from monitor_subs where entity_id = v_id and status = 'active');
  return jsonb_build_object(
    'd30', mcp_obs(v_id, 30),
    'history_since', (select min(checked_at) from mcp_live_history where entity_id = v_id),
    'frequency', case when v_pro then '30min' else 'standard' end,
    'checks', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'c', cls) order by checked_at), '[]')
                 from (select x.checked_at,
                              case when exists (select 1 from mcp_check_incidents i where i.window_start = mcp_window(x.checked_at)) then 'excluded'
                                   else mcp_check_class(x.status, x.http) end as cls
                         from mcp_live_history x
                        where x.entity_id = v_id and x.checked_at > now() - interval '30 days'
                        order by x.checked_at desc limit 60) k),
    'tool_changes', mcp_tool_changes(v_id));
end $$;
revoke execute on function mcp_public_reliability(text) from public;
grant execute on function mcp_public_reliability(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. MCP tool search: same results, availability now from the shared calculation
-- ---------------------------------------------------------------------
create or replace function search_mcp_tools(
  p_secret text, p_client text, p_q text,
  p_capability text default null,      -- capability slug, e.g. 'payments'
  p_access text default null,          -- 'open' (answers without a key) | 'key' (key or sign-in required)
  p_official boolean default null,     -- true = verified domain, false = community
  p_limit int default 20,
  p_daily_cap int default 200)
returns jsonb language plpgsql security definer set search_path = public, vault as $$
declare v_client text; v_n int; v_q tsquery; v_and tsquery; v_res jsonb;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;

  v_client := md5(coalesce(nullif(p_client, ''), 'unknown') || ':tool-search');
  insert into tool_search_quota(day, client, n) values (current_date, v_client, 1)
  on conflict (day, client) do update set n = tool_search_quota.n + 1
  returning n into v_n;
  if v_n > greatest(1, least(coalesce(p_daily_cap, 200), 100000)) then
    return jsonb_build_object('error', 'quota', 'limit', p_daily_cap);
  end if;

  -- every meaningful word may match (OR); results matching more words rank first
  -- all words first (fast and precise); if that finds too little, any word (results matching more words rank first)
  begin
    v_and := plainto_tsquery('english', left(coalesce(p_q, ''), 120));
  exception when others then v_and := null; end;
  if v_and is null or v_and::text = '' then return jsonb_build_object('results', '[]'::jsonb, 'total', 0); end if;
  v_q := v_and;
  if (select count(*) from (select 1 from mcp_tools t where t.tsv @@ v_and limit 20) x) < 20 then
    v_q := replace(v_and::text, '&', '|')::tsquery;
  end if;

  with cand as (            -- bounded: never rank more than 4,000 matches (common words match tens of thousands of tools)
    select t.entity_id, t.name, t.description, t.last_seen_at, t.tsv
      from mcp_tools t
     where t.tsv @@ v_q
     limit 4000
  ),
  hits as (
    select c.entity_id, c.name, c.description, c.last_seen_at,
           ts_rank_cd(c.tsv, v_q) + case when c.tsv @@ v_and then 1 else 0 end as rank
      from cand c
     order by 5 desc
     limit 1500
  ),
  srv as (
    select h.*, e.slug, e.name as server_name, e.short_description,
           l.status, l.checked_at, l.tool_count,
           (select a.value from entity_aliases a where a.entity_id = e.id and a.alias_type = 'mcp_registry' limit 1) as registry_name
      from hits h
      join entities e on e.id = h.entity_id and e.is_published
      left join mcp_live_status l on l.entity_id = e.id
  ),
  filt as (
    select s.*, (s.registry_name is not null and s.registry_name !~* '^io\.github\.') as official
      from srv s
     where (p_access is null
            or (p_access = 'open' and s.status = 'online')
            or (p_access = 'key' and s.status = 'auth_required'))
       and (p_capability is null or exists (
            select 1 from relations r join entities c on c.id = r.to_id and c.type = 'capability'
             where r.from_id = s.entity_id and r.relation = 'has_capability' and r.valid_to is null and c.slug = p_capability))
  ),
  ranked as (
    select f.*, row_number() over (partition by f.entity_id order by f.rank desc, f.name) as per_server
      from filt f
     where p_official is null or f.official = p_official
  ),
  top0 as (
    select * from ranked where per_server <= 3
     order by rank desc, (status = 'online') desc, checked_at desc nulls last
     limit greatest(1, least(coalesce(p_limit, 20), 20))
  ),
  top as (select t0.*, mcp_obs(t0.entity_id, 30) as obs from top0 t0)   -- the one shared reliability calculation
  select jsonb_build_object(
           'results', coalesce(jsonb_agg(jsonb_build_object(
              'tool', t.name,
              'description', left(t.description, 280),
              'server', t.server_name,
              'slug', t.slug,
              'registry_name', t.registry_name,
              'official', t.official,
              'status', t.status,
              'checked_at', t.checked_at,
              'tool_count', t.tool_count,
              'uptime_30d', (t.obs->>'availability')::numeric,     -- observed availability, null under 10 conclusive checks
              'checks_30d', (t.obs->>'conclusive')::int,
              'access', t.obs->>'access',
              'capabilities', (select coalesce(jsonb_agg(c.slug order by c.slug), '[]'::jsonb)
                                 from relations r join entities c on c.id = r.to_id and c.type = 'capability'
                                where r.from_id = t.entity_id and r.relation = 'has_capability' and r.valid_to is null)
           ) order by t.rank desc, (t.status = 'online') desc, t.checked_at desc nulls last), '[]'::jsonb),
           'total', (select count(*) from ranked where per_server <= 3))
    into v_res
    from top t;
  return v_res;
end $$;


-- ---------------------------------------------------------------------
-- 7. /mcp/best: use cases precomputed every hour
--    v_capability_overview counted the agents of every use case on each visit and ran out of time,
--    so /mcp/best showed "Not ready yet". The pages now read this small table.
--    A refresh that fails or finds nothing leaves the previous data in place.
-- ---------------------------------------------------------------------
create table if not exists capability_overview_cache (
  capability_slug   text primary key,
  capability        text not null,
  tools             int not null default 0,
  hosted_tools      int not null default 0,
  open_source_tools int not null default 0,
  agents            int not null default 0,
  computed_at       timestamptz not null default now()
);
alter table capability_overview_cache enable row level security;
drop policy if exists capability_overview_cache_read on capability_overview_cache;
create policy capability_overview_cache_read on capability_overview_cache for select to anon, authenticated using (true);
grant select on capability_overview_cache to anon, authenticated;

create or replace function refresh_capability_overview_cache() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  drop table if exists _cap_new;
  create temp table _cap_new on commit drop as
    select capability_slug, capability, tools, hosted_tools, open_source_tools, agents from v_capability_overview;
  select count(*) into n from _cap_new where tools > 0;
  if n = 0 then
    raise warning 'capability_overview_cache: the new result is empty, previous data kept';
    return 0;
  end if;
  delete from capability_overview_cache;
  insert into capability_overview_cache(capability_slug, capability, tools, hosted_tools, open_source_tools, agents, computed_at)
  select capability_slug, capability, coalesce(tools, 0), coalesce(hosted_tools, 0), coalesce(open_source_tools, 0), coalesce(agents, 0), now()
    from _cap_new;
  return n;
end $$;
revoke execute on function refresh_capability_overview_cache() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Schedules (the database refreshes itself)
-- ---------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('electra-capability-cache', 'electra-check-incidents');
select cron.schedule('electra-capability-cache', '50 * * * *', $job$ select refresh_capability_overview_cache(); $job$);
select cron.schedule('electra-check-incidents', '55 * * * *', $job$ select refresh_mcp_check_incidents(); $job$);

-- first run now: look for our own incidents over the whole history, then fill the use-case table
select refresh_mcp_check_incidents(interval '400 days');
select refresh_capability_overview_cache();

-- ---------------------------------------------------------------------
-- 9. Check (one table of results; nothing is changed by these lines)
-- ---------------------------------------------------------------------
select 'use cases in the new table' as check_name, count(*)::text as result from capability_overview_cache where tools > 0
union all select 'our own incident windows found', count(*)::text from mcp_check_incidents
union all select 'example server', (select slug from mcp_live_status l join entities e on e.id = l.entity_id where l.status = 'online' and l.tool_count between 1 and 100 order by l.checked_at desc limit 1)
union all select 'its 30-day reliability', (select mcp_public_reliability(e.slug)->'d30' from mcp_live_status l join entities e on e.id = l.entity_id where l.status = 'online' and l.tool_count between 1 and 100 order by l.checked_at desc limit 1)::text
union all select 'its tool changes', (select (mcp_public_reliability(e.slug)->'tool_changes') - 'added' - 'removed' from mcp_live_status l join entities e on e.id = l.entity_id where l.status = 'online' and l.tool_count between 1 and 100 order by l.checked_at desc limit 1)::text;
