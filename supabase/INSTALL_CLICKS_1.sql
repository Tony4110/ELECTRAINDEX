-- ELECTRA INDEX — INSTALL_CLICKS_1 : outbound click tracking (private, no personal data)
-- Paste everything into Supabase > SQL Editor > Run.

-- =====================================================================
-- 0019 — Outbound click tracking
--  * Every "Website / Pricing / Source code" button goes through
--    /go/<type>/<slug>?to=<target>. The site calls go_outbound(), which
--    looks up the destination in the database (never from the URL, so the
--    redirect cannot be abused), records the click and returns the URL.
--  * No personal data: no IP, no cookie, no user agent stored.
--  * Clicks are private (no public read). Reports: v_click_report.
-- =====================================================================
alter table outbound_clicks drop constraint if exists outbound_clicks_target_check;
alter table outbound_clicks add constraint outbound_clicks_target_check
  check (target in ('website','pricing','docs','repository','affiliate','sponsored'));

create or replace function go_outbound(p_type text, p_slug text, p_target text, p_path text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_url text; v_target text := coalesce(nullif(p_target, ''), 'website');
begin
  if p_type not in ('agent','mcp_server','payment_provider') or v_target not in ('website','pricing','repository') then
    return null;
  end if;
  select e.id,
         case v_target
           when 'website'    then coalesce(e.website, e.attributes->'website.url'->>'value')
           when 'pricing'    then e.attributes->'pricing.url'->>'value'
           when 'repository' then e.attributes->'repository.url'->>'value'
         end
    into v_id, v_url
    from entities e
   where e.type = p_type and e.slug = p_slug and e.is_published;
  if v_id is null or v_url is null or v_url !~* '^https?://' then return null; end if;
  insert into outbound_clicks(entity_id, page_path, target)
  values (v_id, left(coalesce(nullif(p_path, ''), '/'), 300), v_target);
  return v_url;
end $$;
revoke execute on function go_outbound(text, text, text, text) from public;
grant execute on function go_outbound(text, text, text, text) to anon, authenticated;

-- private report for the SQL Editor (not exposed to the public API)
create or replace view v_click_report as
select date_trunc('day', c.created_at)::date as day, e.type, e.slug, e.name, c.target, count(*) as clicks
  from outbound_clicks c join entities e on e.id = c.entity_id
 group by 1, 2, 3, 4, 5;
revoke all on v_click_report from anon, authenticated;

select 'click tracking ready' as status, (select count(*) from outbound_clicks) as clicks_so_far;
