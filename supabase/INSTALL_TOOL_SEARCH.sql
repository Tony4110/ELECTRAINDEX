-- ELECTRA INDEX — INSTALL_TOOL_SEARCH : "Find an MCP tool" (search V1)
--  Searches the ~335,000 tools that online MCP servers really expose (table mcp_tools, refreshed nightly),
--  with filters: capability, access (works without a key / key required), official (verified domain) or community.
--  * mcp_tools gets a full-text column + index (built once; the table is locked for a minute while it is built).
--  * search_mcp_tools(): 20 results max, at most 3 tools per server, 30-day availability from mcp_live_history
--    (checks blocked by a key are not counted). Callable only by the website / Electra MCP server (shared secret),
--    with a per-visitor daily quota, so the catalogue cannot be bulk-exported.
--  * "Official" = the registry name uses a domain the publisher proved to the Official MCP Registry
--    (e.g. com.stripe/...), not a GitHub namespace (io.github.user/...).
--  Changes nothing else. Paste everything in Supabase > SQL Editor > Run. Re-runnable.

alter table mcp_tools add column if not exists tsv tsvector
  generated always as (
    setweight(to_tsvector('english', regexp_replace(coalesce(name, ''), '([a-z])([A-Z])|[_\-.:/]+', '\1 \2', 'g')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;
create index if not exists idx_mcp_tools_tsv on mcp_tools using gin (tsv);

create table if not exists tool_search_quota (
  day    date not null default current_date,
  client text not null,
  n      int  not null default 0,
  primary key (day, client)
);
alter table tool_search_quota enable row level security;   -- private

create or replace function search_mcp_tools(
  p_secret text, p_client text, p_q text,
  p_capability text default null,      -- capability slug, e.g. 'payments'
  p_access text default null,          -- 'open' (answers without a key) | 'key' (key or sign-in required)
  p_official boolean default null,     -- true = verified domain, false = community
  p_limit int default 20,
  p_daily_cap int default 200)
returns jsonb language plpgsql security definer set search_path = public, vault as $$
declare v_client text; v_n int; v_q tsquery; v_res jsonb;
begin
  if not mcp_secret_ok(p_secret) then raise exception 'not allowed' using errcode = '42501'; end if;
  perform set_config('statement_timeout', '8000', true);

  v_client := md5(coalesce(nullif(p_client, ''), 'unknown') || ':tool-search');
  insert into tool_search_quota(day, client, n) values (current_date, v_client, 1)
  on conflict (day, client) do update set n = tool_search_quota.n + 1
  returning n into v_n;
  if v_n > greatest(1, least(coalesce(p_daily_cap, 200), 100000)) then
    return jsonb_build_object('error', 'quota', 'limit', p_daily_cap);
  end if;

  -- every meaningful word may match (OR); results matching more words rank first
  begin
    v_q := replace(plainto_tsquery('english', left(coalesce(p_q, ''), 120))::text, '&', '|')::tsquery;
  exception when others then v_q := null; end;
  if v_q is null or v_q::text = '' then return jsonb_build_object('results', '[]'::jsonb, 'total', 0); end if;

  with hits as (
    select t.entity_id, t.name, t.description, t.last_seen_at, ts_rank_cd(t.tsv, v_q) as rank
      from mcp_tools t
     where t.tsv @@ v_q
     order by ts_rank_cd(t.tsv, v_q) desc
     limit 3000
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
revoke execute on function search_mcp_tools(text, text, text, text, text, boolean, int, int) from public;
grant execute on function search_mcp_tools(text, text, text, text, text, boolean, int, int) to anon, authenticated;

-- keep the quota table small
select cron.unschedule('electra-tool-search-quota') where exists (select 1 from cron.job where jobname = 'electra-tool-search-quota');
select cron.schedule('electra-tool-search-quota', '50 2 * * *', $job$ delete from tool_search_quota where day < current_date - 7; $job$);

-- check: how many tools are now searchable
select count(*) as tools_searchable, count(distinct entity_id) as servers from mcp_tools where tsv is not null;
