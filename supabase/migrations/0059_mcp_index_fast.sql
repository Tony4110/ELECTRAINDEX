-- ELECTRA INDEX — INSTALL_MCP_INDEX_FAST : fix the empty MCP sitemaps (sitemap/1..5.xml)
--  Why: v_mcp_index recomputed the "strong page" test for all ~46,000 servers on every sitemap request.
--  Deep sitemap pages (rows 20,000+) took longer than the time Supabase allows a public request, so the
--  site received nothing and served an empty sitemap to Google.
--  Fix: the result is stored in a small table (mcp_index), refreshed every hour by the database itself.
--  v_mcp_index keeps the same name and columns, so the website needs no change. Same rule as before.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

create table if not exists mcp_index (
  slug text primary key,
  last_seen_at timestamptz,
  indexable boolean not null default false
);
create index if not exists mcp_index_indexable_slug on mcp_index (indexable, slug);
alter table mcp_index enable row level security;

create or replace function refresh_mcp_index() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from mcp_index;
  insert into mcp_index (slug, last_seen_at, indexable)
  select e.slug,
         e.last_seen_at,
         (coalesce(s.status = 'online' and s.tool_count > 0, false)
          or ((e.attributes->'repository.url'->>'value') is not null
              and length(trim(coalesce(e.description, e.short_description, ''))) >= 80
              and exists (select 1 from relations r where r.from_id = e.id and r.relation = 'has_capability' and r.valid_to is null)))
    from entities e
    left join mcp_live_status s on s.entity_id = e.id
   where e.type = 'mcp_server' and e.is_published and e.slug is not null
  on conflict (slug) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function refresh_mcp_index() from public, anon, authenticated;

select refresh_mcp_index();

create or replace view v_mcp_index as
select slug, last_seen_at, indexable from mcp_index;
grant select on v_mcp_index to anon, authenticated;

select cron.unschedule('electra-mcp-index') where exists (select 1 from cron.job where jobname = 'electra-mcp-index');
select cron.schedule('electra-mcp-index', '45 * * * *', $job$ select refresh_mcp_index(); $job$);

select indexable, count(*) as pages from v_mcp_index group by indexable order by indexable desc;
