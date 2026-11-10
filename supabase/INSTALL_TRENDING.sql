-- =====================================================================
-- INSTALL_TRENDING.sql — Electra Index · Trending (24H / 7D / 30D)
-- Paste the whole file in Supabase > SQL Editor > New query > Run.
-- Safe to run again.
--
-- What it adds
--   * signal_fetches     : when each product was last checked on GitHub / npm
--   * signal_targets()   : which products the robot should check next
--   * ingest_signals()   : the robot sends its numbers here (official APIs only)
--   * refresh_trends()   : recomputes the 24H / 7D / 30D ranking
--   * v_trending         : what the website reads
--
-- Numbers come only from official APIs:
--   SRC-018 GitHub API (stars, forks) · SRC-019 npm downloads API
-- A gain is only shown when we hold an older observation to compare with.
-- No baseline yet -> no number (no source, no claim).
-- =====================================================================

create table if not exists signal_fetches (
  entity_id  uuid not null references entities(id) on delete cascade,
  family     text not null check (family in ('github','npm')),
  fetched_at timestamptz not null default now(),
  ok         boolean not null default true,
  note       text,
  primary key (entity_id, family)
);
alter table signal_fetches enable row level security;

create table if not exists entity_trends (
  entity_id        uuid not null references entities(id) on delete cascade,
  period           text not null check (period in ('24h','7d','30d')),
  stars            numeric,
  stars_gain       numeric,          -- null = no older observation yet
  downloads        numeric,          -- npm downloads inside the period
  downloads_prev   numeric,          -- npm downloads in the period before
  downloads_growth numeric,          -- % vs the period before (only when the previous period has >= 20)
  spark            numeric[],        -- daily npm downloads, oldest first
  score            numeric not null,
  computed_at      timestamptz not null default now(),
  primary key (entity_id, period)
);
alter table entity_trends enable row level security;
create index if not exists idx_entity_trends_period on entity_trends(period, score desc);

-- ---------------------------------------------------------------------
-- Which products to check next (oldest check first).
-- Success -> checked again after 20 h. Not found -> retried after 7 days.
-- ---------------------------------------------------------------------
drop function if exists signal_targets(text, int);
create or replace function signal_targets(p_family text, p_limit int default 500)
returns table (entity_id uuid, ids text[], first boolean)
language sql stable security definer set search_path = public as $$
  select a.entity_id, array_agg(distinct a.value order by a.value), f.fetched_at is null
    from entity_aliases a
    join entities e on e.id = a.entity_id and e.is_published and e.type in ('agent','app','mcp_server')
    left join signal_fetches f on f.entity_id = a.entity_id and f.family = p_family
   where a.alias_type = case p_family when 'github' then 'github_repo' when 'npm' then 'npm' end
     and (f.fetched_at is null
          or f.fetched_at < now() - case when f.ok then interval '20 hours' else interval '7 days' end)
   group by a.entity_id, f.fetched_at, e.type
   order by f.fetched_at nulls first, (e.type <> 'agent'), a.entity_id
   limit greatest(1, least(p_limit, 3000))
$$;

-- ---------------------------------------------------------------------
-- The robot sends:
--   p_points  = [{"entity_id":"…","metric":"github_stars","value":123,"observed_at":"2026-11-10T12:00:00Z"}, …]
--   p_fetched = [{"entity_id":"…","ok":true,"note":null}, …]
-- Same product + metric + time -> value updated (npm days are re-sent each check).
-- ---------------------------------------------------------------------
create or replace function ingest_signals(p_family text, p_points jsonb, p_fetched jsonb, p_run uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_src uuid := (select id from sources where code = case p_family when 'github' then 'SRC-018' else 'SRC-019' end);
  n_pts int := 0; n_f int := 0;
begin
  if p_family not in ('github','npm') then raise exception 'unknown family %', p_family; end if;
  if v_src is null then raise exception 'source % missing in table sources', case p_family when 'github' then 'SRC-018' else 'SRC-019' end; end if;

  insert into metric_points (entity_id, metric, value, observed_at, source_id, run_id)
  select (p->>'entity_id')::uuid, p->>'metric', (p->>'value')::numeric, (p->>'observed_at')::timestamptz, v_src, p_run
    from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) p
   where p->>'metric' in ('github_stars','github_forks','npm_downloads_day')
     and (p->>'value') ~ '^[0-9]+(\.[0-9]+)?$'
     and exists (select 1 from entities e where e.id = (p->>'entity_id')::uuid)
  on conflict (entity_id, metric, observed_at) do update set value = excluded.value, run_id = excluded.run_id;
  get diagnostics n_pts = row_count;

  insert into signal_fetches (entity_id, family, fetched_at, ok, note)
  select (x->>'entity_id')::uuid, p_family, now(), coalesce((x->>'ok')::boolean, true), left(x->>'note', 200)
    from jsonb_array_elements(coalesce(p_fetched, '[]'::jsonb)) x
   where exists (select 1 from entities e where e.id = (x->>'entity_id')::uuid)
  on conflict (entity_id, family) do update set fetched_at = excluded.fetched_at, ok = excluded.ok, note = excluded.note;
  get diagnostics n_f = row_count;

  return jsonb_build_object('points', n_pts, 'checked', n_f);
end $$;

-- ---------------------------------------------------------------------
-- 24H / 7D / 30D ranking.
--   stars_gain  = stars now − stars at the start of the period (needs an observation that old)
--   downloads   = npm downloads in the last N complete days; downloads_prev = the N days before
--   score       = 3·ln(1+stars gained) + ln(1+downloads) + growth bonus (−0.5 … +3)
-- ---------------------------------------------------------------------
create or replace function refresh_trends()
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  truncate entity_trends;  -- (Supabase refuses a DELETE without WHERE)

  with periods(period, days, max_age) as (
    values ('24h', 1, interval '3 days'), ('7d', 7, interval '10 days'), ('30d', 30, interval '40 days')
  ),
  ents as (
    select distinct m.entity_id from metric_points m
     where m.metric in ('github_stars','npm_downloads_day') and m.observed_at > now() - interval '70 days'
  ),
  stars_now as (
    select distinct on (entity_id) entity_id, value, observed_at
      from metric_points where metric = 'github_stars' and observed_at > now() - interval '3 days'
     order by entity_id, observed_at desc
  ),
  dl_last as (
    select entity_id, max(observed_at)::date as d
      from metric_points where metric = 'npm_downloads_day' and observed_at > now() - interval '7 days'
     group by entity_id
  ),
  calc as (
    select e.entity_id, p.period, p.days,
           sn.value as stars,
           sn.value - (select b.value from metric_points b
                        where b.entity_id = e.entity_id and b.metric = 'github_stars'
                          and b.observed_at <= sn.observed_at - make_interval(days => p.days) + interval '4 hours'
                          and b.observed_at >= now() - p.max_age
                        order by b.observed_at desc limit 1) as stars_gain,
           (select sum(m.value) from metric_points m
             where m.entity_id = e.entity_id and m.metric = 'npm_downloads_day'
               and m.observed_at::date >  dl.d - p.days and m.observed_at::date <= dl.d) as downloads,
           (select sum(m.value) from metric_points m
             where m.entity_id = e.entity_id and m.metric = 'npm_downloads_day'
               and m.observed_at::date >  dl.d - 2 * p.days and m.observed_at::date <= dl.d - p.days) as downloads_prev,
           (select array_agg(m.value order by m.observed_at) from metric_points m
             where m.entity_id = e.entity_id and m.metric = 'npm_downloads_day'
               and m.observed_at::date > dl.d - greatest(p.days, 7) and m.observed_at::date <= dl.d) as spark
      from ents e
      cross join periods p
      left join stars_now sn on sn.entity_id = e.entity_id
      left join dl_last dl on dl.entity_id = e.entity_id
  )
  insert into entity_trends (entity_id, period, stars, stars_gain, downloads, downloads_prev, downloads_growth, spark, score)
  select entity_id, period, stars, stars_gain, downloads, downloads_prev, g,
         spark,
         round((3 * ln(1 + greatest(coalesce(stars_gain, 0), 0))
               + ln(1 + coalesce(downloads, 0))
               + least(greatest(coalesce(g, 0), -50), 300) / 100.0)::numeric, 4)
    from (select c.*,
                 case when coalesce(downloads_prev, 0) >= 20
                      then round(((downloads - downloads_prev) / downloads_prev * 100)::numeric, 1) end as g
            from calc c) x
   where coalesce(stars_gain, 0) > 0 or coalesce(downloads, 0) > 0;
  get diagnostics n = row_count;
  return jsonb_build_object('rows', n, 'at', now());
end $$;

-- ---------------------------------------------------------------------
-- What the website reads. MCP servers only when their page is indexable.
-- ---------------------------------------------------------------------
create or replace view v_trending as
select t.period, e.type, e.slug, e.name, e.short_description, e.website,
       t.stars, t.stars_gain, t.downloads, t.downloads_prev, t.downloads_growth, t.spark, t.score,
       rank() over (partition by t.period order by t.score desc) as rank_all,
       rank() over (partition by t.period, e.type order by t.score desc) as rank_type,
       t.computed_at
  from entity_trends t
  join entities e on e.id = t.entity_id and e.is_published and e.type in ('agent','app','mcp_server')
 where e.type <> 'mcp_server' or exists (select 1 from v_mcp_index i where i.slug = e.slug and i.indexable);
grant select on v_trending to anon, authenticated;

-- Quick check for you (no secret inside).
create or replace function signals_status()
returns table (family text, products_with_id bigint, checked bigint, not_found bigint, last_check timestamptz)
language sql stable security definer set search_path = public as $$
  select f.family,
         (select count(distinct a.entity_id) from entity_aliases a
           where a.alias_type = case f.family when 'github' then 'github_repo' else 'npm' end),
         count(s.entity_id) filter (where s.ok), count(s.entity_id) filter (where not s.ok), max(s.fetched_at)
    from (values ('github'), ('npm')) f(family)
    left join signal_fetches s on s.family = f.family
   group by f.family
$$;

revoke execute on function signal_targets(text, int) from public, anon, authenticated;
revoke execute on function ingest_signals(text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function refresh_trends() from public, anon, authenticated;
revoke execute on function signals_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Schedule: the robot "signals-adoption" runs every hour (at minute 17).
-- Until the Edge Function exists, the calls simply fail; nothing breaks.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'electra-signals-adoption';
select cron.schedule(
  'electra-signals-adoption',
  '17 * * * *',
  $job$
    select net.http_post(
      url     := 'https://rqgnjavfbahderwxykox.supabase.co/functions/v1/signals-adpotion',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $job$
);

-- Result you should see: two lines, "github" and "npm", with the number of products we can follow.
select * from signals_status();
