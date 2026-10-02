-- =====================================================================
-- 0017 — Electra Payment Index (v1: protocols, providers, public fees)
--  * Protocols (x402, MPP, AP2, ACP, UCP…) and payment providers are
--    entities like everything else: sourced facts, history, evidence level.
--  * provider_fees: public fee lines read on each provider's pricing page.
--  * protocol_mentions: how many indexed agents/tools mention a protocol
--    in their own description (derived, keyword match).
--  Electra Index does not process payments. It documents who supports what.
-- =====================================================================
insert into entity_types(code,label,plural,url_prefix,is_listing,sort_order) values
('protocol','Protocol','Protocols','/protocols',false,95),
('payment_provider','Payment provider','Payment providers','/payments/providers',true,96)
on conflict (code) do nothing;
insert into relation_types(code,label,from_type,to_type) values
('supports_protocol','supports protocol',null,'protocol')
on conflict (code) do nothing;
insert into sources(code,name,layer,role,priority,access,reliability,is_active,notes) values
('SRC-110','Official protocol specifications and documentation','Protocols & payments','Source','P0','Public docs','high',true,
 'Specs, official docs, GitHub repositories and official announcements of payment and agent protocols')
on conflict (code) do nothing;

create table if not exists provider_fees (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references entities(id) on delete cascade,
  label         text not null,
  percent       numeric(8,4),
  fixed         numeric(14,6),
  currency      char(3),
  region        text,
  description   text,
  evidence_level evidence_level not null default 'observed',
  source_id     uuid references sources(id),
  evidence_url  text,
  observed_at   timestamptz not null default clock_timestamp(),
  last_confirmed_at timestamptz not null default clock_timestamp(),
  valid_to      timestamptz
);
create index if not exists idx_provider_fees_entity on provider_fees(entity_id) where valid_to is null;
alter table provider_fees enable row level security;
drop policy if exists pub_read on provider_fees;
create policy pub_read on provider_fees for select using (true);

create table if not exists protocol_patterns (
  protocol_slug text primary key,
  pattern       text not null
);
insert into protocol_patterns values
 ('x402', '\mx402\M'),
 ('mpp',  '\m(mpp|machine payments protocol)\M'),
 ('ap2',  '\m(ap2|agent payments protocol)\M'),
 ('acp',  '\m(agentic commerce protocol)\M'),
 ('ucp',  '\m(ucp|universal commerce protocol)\M'),
 ('a2a',  '\m(a2a|agent2agent|agent-to-agent protocol)\M'),
 ('l402', '\m(l402|lsat)\M'),
 ('kyapay', '\m(kyapay|kya pay)\M')
on conflict (protocol_slug) do update set pattern = excluded.pattern;
alter table protocol_patterns enable row level security;

create table if not exists protocol_mentions (
  protocol_slug text primary key,
  tools         int not null default 0,
  agents        int not null default 0,
  refreshed_at  timestamptz not null default now()
);
alter table protocol_mentions enable row level security;
drop policy if exists pub_read on protocol_mentions;
create policy pub_read on protocol_mentions for select using (true);

create or replace function refresh_protocol_mentions() returns void language plpgsql as $$
begin
  insert into protocol_mentions(protocol_slug, tools, agents, refreshed_at)
  select p.protocol_slug,
         count(*) filter (where e.type = 'mcp_server'),
         count(*) filter (where e.type = 'agent'),
         now()
    from protocol_patterns p
    left join entities e on e.is_published and e.type in ('mcp_server','agent')
         and lower(e.name || ' ' || coalesce(e.short_description,'') || ' ' || coalesce(e.description,'')) ~ p.pattern
   group by p.protocol_slug
  on conflict (protocol_slug) do update set tools = excluded.tools, agents = excluded.agents, refreshed_at = now();
end $$;
revoke execute on function refresh_protocol_mentions() from public, anon, authenticated;

-- helper: record a fact only when it is known
create or replace function obs_if(p_id uuid, p_field text, p_val jsonb, p_ev evidence_level, p_src text, p_url text) returns void language plpgsql as $$
begin
  if p_val is null or jsonb_typeof(p_val) = 'null' then return; end if;
  if jsonb_typeof(p_val) = 'array' and jsonb_array_length(p_val) = 0 then return; end if;
  if jsonb_typeof(p_val) = 'string' and p_val #>> '{}' = '' then return; end if;
  perform record_observation(p_id, p_field, p_val, p_ev, p_src, 'medium', p_url);
end $$;
revoke execute on function obs_if(uuid, text, jsonb, evidence_level, text, text) from public, anon, authenticated;

create or replace function ingest_protocol(p jsonb) returns uuid language plpgsql as $$
declare v_id uuid; v_started timestamptz := clock_timestamp(); v_slug text := slugify(p->>'name');
        v_url text := coalesce(p->>'official_url', p->>'spec_url', p->'sources'->>0);
begin
  select id into v_id from entities where type = 'protocol' and slug = v_slug;
  if v_id is null then
    v_id := resolve_entity('protocol', p->>'name', jsonb_build_array(jsonb_build_object('type','other','value','protocol:' || v_slug)), 'SRC-110', v_url, left(p->>'one_liner', 300));
  end if;
  update entities set status = 'active', is_published = true, confidence = 'medium', last_seen_at = now(), last_verified_at = now(),
         website = coalesce(v_url, website), short_description = left(p->>'one_liner', 300), description = p->>'full_name'
   where id = v_id;
  perform obs_if(v_id, 'payment.role',       p->'role',       'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'payment.best_for',   p->'best_for',   'derived',  'SRC-000', v_url);
  perform obs_if(v_id, 'payment.money',      p->'money',      'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'protocol.stewards',  p->'stewards',   'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'protocol.governance',p->'governance', 'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'protocol.status',    p->'status',     'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'protocol.launched',  p->'launched',   'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'protocol.spec_url',  p->'spec_url',   'declared', 'SRC-110', p->>'spec_url');
  perform obs_if(v_id, 'repository.url',     case when coalesce(p->>'github_repo','') <> '' then to_jsonb('https://github.com/' || (p->>'github_repo')) end, 'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'payment.networks',   p->'networks',   'declared', 'SRC-110', v_url);
  perform obs_if(v_id, 'sources',            p->'sources',    'declared', 'SRC-110', v_url);
  delete from change_events where entity_id = v_id and detected_at >= v_started and event_type in ('new_entity','field_changed') and old_value is null;
  return v_id;
end $$;
revoke execute on function ingest_protocol(jsonb) from public, anon, authenticated;

create or replace function ingest_payment_provider(p jsonb) returns uuid language plpgsql as $$
declare v_id uuid; v_proto uuid; v_started timestamptz := clock_timestamp(); x text; f jsonb; v_prev provider_fees%rowtype;
        v_ev evidence_level := case when coalesce((p->>'pricing_verified')::boolean, false) then 'observed' else 'declared' end;
        v_src uuid := source_id_of('SRC-049'); v_seen text[] := '{}';
begin
  v_id := resolve_entity('payment_provider', p->>'name', jsonb_build_array(jsonb_build_object('type','other','value','provider:' || slugify(p->>'name'))), 'SRC-049', p->>'website', left(p->>'one_liner', 300));
  update entities set status = 'active', is_published = true, confidence = 'medium', last_seen_at = now(),
         website = coalesce(p->>'website', website), short_description = left(p->>'one_liner', 300)
   where id = v_id;
  perform obs_if(v_id, 'provider.kind',            p->'kind',            'declared', 'SRC-000', p->>'website');
  perform obs_if(v_id, 'provider.company',         p->'company',         'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'provider.agentic_product', p->'agentic_product', 'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'payment.rails',            p->'rails',           'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'payment.networks',         p->'networks',        'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'pricing.url',              p->'pricing_url',     'declared', 'SRC-049', p->>'pricing_url');
  perform obs_if(v_id, 'pricing.public',           p->'pricing_public',  v_ev,       'SRC-049', p->>'pricing_url');
  perform obs_if(v_id, 'provider.kyc_required',    p->'kyc_required',    'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'provider.regions',         p->'regions',         'declared', 'SRC-049', p->>'website');
  perform obs_if(v_id, 'sources',                  p->'sources',         'declared', 'SRC-049', p->>'website');

  -- protocols the provider itself documents
  for x in select jsonb_array_elements_text(coalesce(p->'protocols', '[]'::jsonb)) loop
    select id into v_proto from entities where type = 'protocol' and slug = slugify(x);
    if v_proto is not null then
      perform link(v_id, 'supports_protocol', v_proto, 'declared', 'SRC-049', 'medium', 'stated on the provider''s own page', p->'protocol_sources'->>x);
    end if;
  end loop;

  -- public fee lines (history kept: a changed line closes the old one)
  for f in select * from jsonb_array_elements(coalesce(p->'fees', '[]'::jsonb)) loop
    if coalesce(f->>'label','') = '' or lower(f->>'label') = any(v_seen) then continue; end if;
    if f->>'percent' is null and f->>'fixed' is null then continue; end if;
    v_seen := v_seen || lower(f->>'label');
    select * into v_prev from provider_fees where entity_id = v_id and lower(label) = lower(f->>'label') and valid_to is null;
    if found and v_prev.percent is not distinct from round((f->>'percent')::numeric, 4)
             and v_prev.fixed is not distinct from round((f->>'fixed')::numeric, 6) then
      update provider_fees set last_confirmed_at = clock_timestamp() where id = v_prev.id;
    else
      if found then
        update provider_fees set valid_to = clock_timestamp() where id = v_prev.id;
        insert into change_events(entity_id, event_type, field, old_value, new_value, source_id, importance)
        values (v_id, 'field_changed', 'fee.' || slugify(f->>'label'),
                jsonb_build_object('percent', v_prev.percent, 'fixed', v_prev.fixed),
                jsonb_build_object('percent', (f->>'percent')::numeric, 'fixed', (f->>'fixed')::numeric), v_src, 3);
      end if;
      insert into provider_fees(entity_id, label, percent, fixed, currency, region, description, evidence_level, source_id, evidence_url)
      values (v_id, f->>'label', round((f->>'percent')::numeric, 4), round((f->>'fixed')::numeric, 6),
              nullif(upper(f->>'currency'), ''), nullif(f->>'region', ''), left(f->>'description', 400), v_ev, v_src, p->>'pricing_url');
    end if;
  end loop;
  if v_ev = 'observed' then update entities set last_verified_at = now() where id = v_id; end if;

  delete from change_events where entity_id = v_id and detected_at >= v_started and event_type in ('new_entity','protocol_added','field_changed') and old_value is null;
  return v_id;
end $$;
revoke execute on function ingest_payment_provider(jsonb) from public, anon, authenticated;

create or replace function ingest_payments(p_protocols jsonb, p_providers jsonb) returns jsonb language plpgsql as $$
declare it jsonb; n1 int := 0; n2 int := 0; errs jsonb := '[]'::jsonb;
begin
  for it in select * from jsonb_array_elements(p_protocols) loop
    begin perform ingest_protocol(it); n1 := n1 + 1;
    exception when others then errs := errs || jsonb_build_array(jsonb_build_object('protocol', it->>'name', 'error', sqlerrm)); end;
  end loop;
  for it in select * from jsonb_array_elements(p_providers) loop
    begin perform ingest_payment_provider(it); n2 := n2 + 1;
    exception when others then errs := errs || jsonb_build_array(jsonb_build_object('provider', it->>'name', 'error', sqlerrm)); end;
  end loop;
  perform refresh_protocol_mentions();
  return jsonb_build_object('protocols', n1, 'providers', n2, 'errors', errs);
end $$;
revoke execute on function ingest_payments(jsonb, jsonb) from public, anon, authenticated;

-- public read models
create or replace view v_protocols as
select e.id, e.slug, e.name, e.description as full_name, e.short_description as one_liner, e.website,
       e.attributes->'payment.role'->>'value'        as role,
       e.attributes->'payment.best_for'->>'value'    as best_for,
       e.attributes->'payment.money'->'value'        as money,
       e.attributes->'protocol.stewards'->'value'    as stewards,
       e.attributes->'protocol.governance'->>'value' as governance,
       e.attributes->'protocol.status'->>'value'     as status,
       e.attributes->'protocol.launched'->>'value'   as launched,
       e.attributes->'protocol.spec_url'->>'value'   as spec_url,
       e.attributes->'repository.url'->>'value'      as repository_url,
       e.attributes->'payment.networks'->'value'     as networks,
       e.attributes->'sources'->'value'              as sources,
       e.last_verified_at,
       (select count(*) from relations r join entities pe on pe.id = r.from_id and pe.is_published
         where r.to_id = e.id and r.relation = 'supports_protocol' and r.valid_to is null) as providers,
       coalesce(m.tools, 0) as tools_mentioning, coalesce(m.agents, 0) as agents_mentioning
  from entities e
  left join protocol_mentions m on m.protocol_slug = e.slug
 where e.type = 'protocol' and e.is_published and e.attributes ? 'payment.role';

create or replace view v_payment_providers as
select e.id, e.slug, e.name, e.short_description as one_liner, e.website, e.last_verified_at,
       e.attributes->'provider.kind'->>'value'            as kind,
       e.attributes->'provider.company'->>'value'         as company,
       e.attributes->'provider.agentic_product'->>'value' as agentic_product,
       e.attributes->'payment.rails'->'value'             as rails,
       e.attributes->'payment.networks'->'value'          as networks,
       e.attributes->'pricing.url'->>'value'              as pricing_url,
       (e.attributes->'pricing.public'->'value')::text::boolean as pricing_public,
       (select coalesce(jsonb_agg(jsonb_build_object('slug', pr.slug, 'name', pr.name, 'url', r.evidence_url) order by pr.name), '[]'::jsonb)
          from relations r join entities pr on pr.id = r.to_id
         where r.from_id = e.id and r.relation = 'supports_protocol' and r.valid_to is null) as protocols,
       (select coalesce(jsonb_agg(jsonb_build_object('label', f.label, 'percent', f.percent, 'fixed', f.fixed, 'currency', f.currency,
                 'region', f.region, 'description', f.description, 'evidence', f.evidence_level, 'checked', f.last_confirmed_at) order by f.observed_at, f.label), '[]'::jsonb)
          from provider_fees f where f.entity_id = e.id and f.valid_to is null) as fees
  from entities e
 where e.type = 'payment_provider' and e.is_published;

grant select on v_protocols, v_payment_providers, provider_fees, protocol_mentions to anon, authenticated;

-- keep protocol mention counts fresh with the rankings (every 10 minutes)
create or replace function refresh_rankings() returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_task_rankings;
  refresh materialized view concurrently mv_theme_rankings;
  perform refresh_protocol_mentions();
end $$;
revoke execute on function refresh_rankings() from public, anon, authenticated;
