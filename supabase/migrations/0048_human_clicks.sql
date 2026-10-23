-- =====================================================================
-- 0048 — Count only real human clicks
--  Robots disguised as browsers were following our "Website" buttons
--  (about 10,000 "clicks" a week on 6,800 different pages). From now on a
--  click is marked human only when:
--   * it comes from a page of electraindex.com (the browser says so),
--   * it does not look like a robot (user agent, missing headers),
--   * it is the first click of that visitor on that product today,
--   * that visitor made at most 20 clicks today.
--  Visitor = a one-way hash of (connection + browser + day), computed by the
--  website; it changes every day and cannot be turned back into an address.
--  Every click is still logged (robots too) so we can watch them.
--  Sponsored clicks (Launch Spotlight) are flagged separately.
-- =====================================================================
alter table outbound_clicks add column if not exists human boolean not null default false;
alter table outbound_clicks add column if not exists visitor text;
alter table outbound_clicks add column if not exists sponsored boolean not null default false;
create index if not exists idx_clicks_visitor_day on outbound_clicks(visitor, created_at) where visitor is not null;
create index if not exists idx_clicks_human on outbound_clicks(entity_id, created_at) where human;

drop function if exists go_outbound(text, text, text, text);
create or replace function go_outbound(p_type text, p_slug text, p_target text, p_path text default null,
                                       p_visitor text default null, p_human boolean default false,
                                       p_sponsored boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_url text; v_aff text; v_target text := coalesce(nullif(p_target, ''), 'website');
        v_human boolean := coalesce(p_human, false) and p_visitor is not null;
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
  if v_id is null then return null; end if;
  if v_target = 'website' then
    select url into v_aff from affiliate_links where entity_id = v_id and active;
    if v_aff is not null then v_url := v_aff; v_target := 'affiliate'; end if;
  end if;
  if v_url is null or v_url !~* '^https?://' then return null; end if;
  if v_human then
    -- one click per visitor and product per day; more than 20 clicks a day is not a person browsing
    if exists (select 1 from outbound_clicks where visitor = p_visitor and entity_id = v_id and human
                and created_at > date_trunc('day', now()))
       or (select count(*) from outbound_clicks where visitor = p_visitor and created_at > date_trunc('day', now())) >= 20 then
      v_human := false;
    end if;
  end if;
  insert into outbound_clicks(entity_id, page_path, target, visitor, human, sponsored)
  values (v_id, left(coalesce(nullif(p_path, ''), '/'), 300), v_target, left(p_visitor, 64), v_human, coalesce(p_sponsored, false));
  return v_url;
end $$;
revoke execute on function go_outbound(text, text, text, text, text, boolean, boolean) from public;
grant execute on function go_outbound(text, text, text, text, text, boolean, boolean) to anon, authenticated;

-- private report: human clicks only
create or replace view v_human_click_report as
select date_trunc('day', c.created_at)::date as day, e.type, e.slug, e.name, c.target, c.sponsored, count(*) as clicks
  from outbound_clicks c join entities e on e.id = c.entity_id
 where c.human
 group by 1, 2, 3, 4, 5, 6
 order by 1 desc, clicks desc;
revoke all on v_human_click_report from anon, authenticated;
