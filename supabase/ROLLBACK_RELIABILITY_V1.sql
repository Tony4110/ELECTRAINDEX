-- ELECTRA INDEX — ROLLBACK_RELIABILITY_V1 : undo INSTALL_RELIABILITY_V1
--  Puts back the previous calculations (paid history, Monitoring badge, tool search) exactly as they were,
--  removes the public reliability function and stops the two new schedules.
--  Nothing in the check history or the tool records is touched. The two small new tables stay (unused, harmless).
--  Use it together with a rollback of the website on Netlify (Deploys > previous deploy > Publish deploy).
-- Paste everything in Supabase > SQL Editor > Run.

select cron.unschedule(jobid) from cron.job where jobname in ('electra-capability-cache', 'electra-check-incidents');
drop function if exists mcp_public_reliability(text);

create or replace function server_history_data(p_entity uuid, p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int := least(greatest(coalesce(p_days, 90), 1), 365); r jsonb; v_slug text; v_name text;
begin
  select slug, name into v_slug, v_name from entities where id = p_entity;
  if v_slug is null then return null; end if;
  with h as (
    select checked_at, status, http, tool_count, protocol_version,
           lag(status) over (order by checked_at) as prev
      from mcp_live_history
     where entity_id = p_entity and checked_at > now() - make_interval(days => v_days)
  )
  select jsonb_build_object(
    'slug', v_slug, 'name', v_name, 'days', v_days,
    'checks', (select count(*) from h),
    'answered', (select count(*) from h where status in ('online','auth_required')),
    'answer_rate', (select round(100.0 * count(*) filter (where status in ('online','auth_required')) / nullif(count(*), 0), 1) from h),
    'first_check', (select min(checked_at) from h),
    'last_check', (select max(checked_at) from h),
    'last_online', (select max(checked_at) from h where status = 'online'),
    'transitions', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'from', prev, 'to', status) order by checked_at), '[]')
                      from h where prev is not null and prev is distinct from status),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', checked_at, 'status', status, 'http', http, 'tools', tool_count, 'protocol', protocol_version) order by checked_at desc), '[]')
                   from (select * from h order by checked_at desc limit 200) t),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('at', detected_at, 'from', old_value, 'to', new_value) order by detected_at desc), '[]')
                   from change_events where entity_id = p_entity and event_type = 'new_version' and is_published
                    and detected_at > now() - make_interval(days => v_days)),
    'method', 'Each check opens an MCP session and lists tools; it never runs a tool. "Answered" = online or asked for credentials. Not a guarantee of security, quality or uptime.'
  ) into r;
  return r;
end $$;
revoke execute on function server_history_data(uuid, int) from public, anon, authenticated;


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
           'rate30', case when v_pro then (select round(100.0 * count(*) filter (where h.status in ('online','auth_required')) / nullif(count(*), 0), 1)
                                             from mcp_live_history h where h.entity_id = v_id and h.checked_at > now() - interval '30 days') end)
    into r from mcp_live_status l where l.entity_id = v_id;
  return coalesce(r, jsonb_build_object('status', 'unchecked', 'pro', v_pro));
end $$;
revoke execute on function monitor_badge(text) from public;
grant execute on function monitor_badge(text) to anon, authenticated;


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
  top as (
    select * from ranked where per_server <= 3
     order by rank desc, (status = 'online') desc, checked_at desc nulls last
     limit greatest(1, least(coalesce(p_limit, 20), 20))
  )
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
              'uptime_30d', (select round(100.0 * count(*) filter (where h.status = 'online') / nullif(count(*), 0))
                               from mcp_live_history h
                              where h.entity_id = t.entity_id and h.checked_at > now() - interval '30 days'
                                and h.status <> 'auth_required'),
              'checks_30d', (select count(*) from mcp_live_history h
                              where h.entity_id = t.entity_id and h.checked_at > now() - interval '30 days'),
              'capabilities', (select coalesce(jsonb_agg(c.slug order by c.slug), '[]'::jsonb)
                                 from relations r join entities c on c.id = r.to_id and c.type = 'capability'
                                where r.from_id = t.entity_id and r.relation = 'has_capability' and r.valid_to is null)
           ) order by t.rank desc, (t.status = 'online') desc, t.checked_at desc nulls last), '[]'::jsonb),
           'total', (select count(*) from ranked where per_server <= 3))
    into v_res
    from top t;
  return v_res;
end $$;

