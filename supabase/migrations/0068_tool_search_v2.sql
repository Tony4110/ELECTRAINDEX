-- ELECTRA INDEX — INSTALL_TOOL_SEARCH_V2 : faster "Find an MCP tool"
--  The first version could exceed the time allowed for a public request on common words ("create", "get").
--  Now: all the words first (precise and fast); only if that finds fewer than 20 tools, any of the words;
--  and never more than 4,000 matches ranked. Same results format, same filters, same quota. Re-runnable.
-- Paste everything in Supabase > SQL Editor > Run.

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

-- check (should answer in well under a second)
explain (analyze, costs off, timing off, summary on)
select 1 from mcp_tools t where t.tsv @@ plainto_tsquery('english', 'create invoice') limit 20;
