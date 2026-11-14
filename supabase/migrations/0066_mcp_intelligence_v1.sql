-- =====================================================================
-- ELECTRA INDEX — INSTALL_MCP_INTELLIGENCE_V1  (same model as the Taygeta publisher classification)
--  1. TOOLS become records: every tool our robot read on an online server is stored in mcp_tools
--     (server, name, description, first seen, last seen). Refreshed every day.
--  2. AI CLASSIFICATION of online MCP servers into Electra's existing capabilities
--     (web-research, payments, crm-integration... same list as the keyword classifier),
--     from the server description AND the tools it really exposes. Claude Haiku, 20 servers per call,
--     max 15 tools per server, one call every 10 minutes at most (the function refuses to run more often, so no runaway cost).
--     Results become "has_capability" links (evidence: derived, with confidence) + mcp_ai_class.
--  Nothing is published by this file alone. Needs the Edge Function classify-mcp (separate file)
--  and the secret ANTHROPIC_API_KEY in Supabase > Edge Functions > Secrets.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tools as records
-- ---------------------------------------------------------------------
create table if not exists mcp_tools (
  entity_id     uuid not null references entities(id) on delete cascade,
  name          text not null,
  description   text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (entity_id, name)
);
create index if not exists idx_mcp_tools_name on mcp_tools(lower(name));
alter table mcp_tools enable row level security;   -- private for now (public views later)

create or replace function refresh_mcp_tools() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into mcp_tools(entity_id, name, description)
  select distinct on (l.entity_id, left(t->>'name', 200))   -- a server can list the same tool name twice
         l.entity_id, left(t->>'name', 200), left(t->>'description', 1000)
    from mcp_live_status l
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l.tools) = 'array' then l.tools else '[]'::jsonb end) t
   where l.status = 'online' and coalesce(t->>'name', '') <> ''
   order by l.entity_id, left(t->>'name', 200)
  on conflict (entity_id, name) do update
     set description = coalesce(excluded.description, mcp_tools.description), last_seen_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function refresh_mcp_tools() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. AI classification
-- ---------------------------------------------------------------------
create table if not exists mcp_ai_class (
  entity_id     uuid primary key references entities(id) on delete cascade,
  capabilities  text[] not null default '{}',
  summary       text,
  confidence    text not null check (confidence in ('high','medium','low')),
  tool_count    int,
  model         text not null,
  classified_at timestamptz not null default now()
);
alter table mcp_ai_class enable row level security;   -- private

create table if not exists mcp_ai_runs (
  id         bigserial primary key,
  started_at timestamptz not null default now(),
  n_sent     int not null default 0,
  n_saved    int,
  note       text
);
alter table mcp_ai_runs enable row level security;   -- private

-- the next batch: online servers with tools, never classified, or whose tool list changed since
-- (returns nothing if a batch already started less than 9 minutes ago: cost guard)
create or replace function next_mcp_to_classify(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_n int;
begin
  if exists (select 1 from mcp_ai_runs where started_at > now() - interval '9 minutes') then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb), count(*) into v, v_n from (
    select e.id, e.name, left(coalesce(e.short_description, e.description, ''), 400) as description,
           (select jsonb_agg(jsonb_build_object('n', left(t.name, 80), 'd', left(coalesce(t.description, ''), 90)) order by t.name)
              from (select * from mcp_tools mt where mt.entity_id = e.id order by mt.name limit 15) t) as tools
      from mcp_live_status l
      join entities e on e.id = l.entity_id and e.type = 'mcp_server' and e.status = 'active'
      left join mcp_ai_class c on c.entity_id = e.id
     where l.status = 'online' and coalesce(l.tool_count, 0) > 0
       and exists (select 1 from mcp_tools mt where mt.entity_id = e.id)
       and (c.entity_id is null or c.tool_count is distinct from l.tool_count)
     order by (c.entity_id is null) desc, e.first_seen_at desc
     limit p_limit) x;
  if v_n > 0 then insert into mcp_ai_runs(n_sent) values (v_n); end if;
  return v;
end $$;
revoke execute on function next_mcp_to_classify(int) from public, anon, authenticated;

-- the capability list the model chooses from (Electra's own taxonomy)
create or replace function mcp_capability_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by slug), '[]'::jsonb)
    from entities where type = 'capability' and status = 'active'
$$;
revoke execute on function mcp_capability_list() from public, anon, authenticated;

-- save: p_rows = [{id, capabilities: [slug...], summary, confidence}]
create or replace function save_mcp_classifications(p_rows jsonb, p_model text) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_id uuid; v_caps text[]; v_conf text; n int := 0; v_src uuid; v_tc int;
begin
  select id into v_src from sources where code = 'SRC-000';
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    begin v_id := (r->>'id')::uuid; exception when others then continue; end;
    if not exists (select 1 from entities where id = v_id and type = 'mcp_server') then continue; end if;
    v_conf := case when r->>'confidence' in ('high','medium','low') then r->>'confidence' else 'low' end;
    -- keep only capabilities that exist in Electra's taxonomy (max 4)
    select coalesce(array_agg(distinct c.slug), '{}') into v_caps
      from jsonb_array_elements_text(case when jsonb_typeof(r->'capabilities') = 'array' then r->'capabilities' else '[]'::jsonb end) s
      join entities c on c.type = 'capability' and c.slug = s;
    v_caps := v_caps[1:4];
    select tool_count into v_tc from mcp_live_status where entity_id = v_id;

    insert into mcp_ai_class(entity_id, capabilities, summary, confidence, tool_count, model, classified_at)
    values (v_id, v_caps, left(r->>'summary', 300), v_conf, v_tc, p_model, now())
    on conflict (entity_id) do update
       set capabilities = excluded.capabilities, summary = excluded.summary, confidence = excluded.confidence,
           tool_count = excluded.tool_count, model = excluded.model, classified_at = now();

    if array_length(v_caps, 1) > 0 then
      insert into relations(from_id, relation, to_id, evidence_level, confidence, source_id, evidence)
      select v_id, 'has_capability', c.id, 'derived', v_conf::confidence_lvl, v_src, 'ai-v1: classified from the tools the server exposes'
        from entities c where c.type = 'capability' and c.slug = any(v_caps)
      on conflict (from_id, relation, to_id, evidence_level) do update
         set confidence = case when relations.confidence = 'low' then excluded.confidence else relations.confidence end,
             evidence = case when relations.evidence like '%ai-v1%' then relations.evidence else relations.evidence || ' + ai-v1' end,
             last_seen_at = now(), valid_to = null;
    end if;

    insert into classification_log(entity_id, method, classified_at, n_capabilities)
    values (v_id, 'ai-v1', now(), coalesce(array_length(v_caps, 1), 0))
    on conflict (entity_id, method) do update set classified_at = now(), n_capabilities = excluded.n_capabilities;
    n := n + 1;
  end loop;
  update mcp_ai_runs set n_saved = n where id = (select max(id) from mcp_ai_runs);
  return n;
end $$;
revoke execute on function save_mcp_classifications(jsonb, text) from public, anon, authenticated;

-- your progress view (private)
create or replace view v_mcp_ai_progress as
select (select count(*) from mcp_live_status l where l.status = 'online' and coalesce(l.tool_count, 0) > 0) as online_with_tools,
       (select count(*) from mcp_ai_class) as classified,
       (select count(*) from mcp_ai_class where confidence = 'high') as high_confidence,
       (select count(*) from mcp_ai_class where capabilities = '{}') as no_capability_found,
       (select count(*) from mcp_tools) as tools_stored,
       (select count(distinct lower(name)) from mcp_tools) as distinct_tool_names,
       (select max(started_at) from mcp_ai_runs) as last_batch;
revoke all on v_mcp_ai_progress from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Schedule
-- ---------------------------------------------------------------------
select cron.unschedule(jobname) from cron.job where jobname in ('electra-mcp-tools', 'electra-classify-mcp');
select cron.schedule('electra-mcp-tools', '35 3 * * *', $job$ select refresh_mcp_tools(); $job$);
select cron.schedule('electra-classify-mcp', '*/10 * * * *', $job$
  select net.http_post(
    url     := 'https://rqgnjavfbahderwxykox.supabase.co/functions/v1/classify-mcp',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000);
$job$);

-- first fill of the tools table now (can take a few seconds)
select refresh_mcp_tools() as tools_stored_now;
select * from v_mcp_ai_progress;
