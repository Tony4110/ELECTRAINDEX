-- =====================================================================
--  ELECTRA — INSTALL_REVERIFY_1 : robot de re-vérification (100% SQL)
--  Re-visite chaque semaine les URL de preuve du Top 50 :
--   - 2xx/3xx  -> la preuve tient -> rafraîchit last_verified_at
--   - 404/410  -> preuve morte    -> retire la claim (docs attr / capability),
--                 journalise un change_event, recalcule le score
--   - 5xx/timeout/erreur -> on ne touche à rien (incident passager)
--  Deux phases (pg_net est asynchrone) : dispatch -> (quelques min) -> apply.
--  Paste une fois. Test manuel :
--     select reverify_dispatch(10);   -- attendre ~30s
--     select reverify_apply();        -- {live_ok, docs_dead, caps_removed, affected}
-- =====================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists reverify_checks (
  request_id    bigint primary key,
  url           text not null,
  kind          text not null check (kind in ('docs','capability')),
  dispatched_at timestamptz not null default now(),
  applied       boolean not null default false
);
create index if not exists idx_reverify_pending on reverify_checks(applied, dispatched_at);

-- ---------------------------------------------------------------------
-- DISPATCH : tire un GET sur chaque URL de preuve à re-contrôler
-- ---------------------------------------------------------------------
create or replace function reverify_dispatch(p_batch int default 200,
                                             p_stale interval default interval '6 days')
returns int language plpgsql security definer set search_path = public as $$
declare rec record; rid bigint; n int := 0;
begin
  for rec in
    with targets as (
      select distinct (attributes->'docs.url'->>'value') as url, 'docs'::text as kind
        from entities
        where type='agent' and is_published and attributes ? 'docs.url'
          and coalesce(attributes->'docs.url'->>'value','') <> ''
      union
      select distinct evidence_url as url, 'capability'::text as kind
        from relations
        where relation='has_capability' and evidence_level='observed' and valid_to is null
          and coalesce(evidence_url,'') <> ''
    )
    select t.url, t.kind from targets t
    where not exists (
      select 1 from reverify_checks rc
      where rc.url = t.url and rc.dispatched_at > now() - p_stale
    )
    limit p_batch
  loop
    select net.http_get(url := rec.url, timeout_milliseconds := 15000) into rid;
    insert into reverify_checks(request_id, url, kind) values (rid, rec.url, rec.kind)
      on conflict (request_id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- APPLY : lit les réponses, dégrade les preuves mortes, rafraîchit les vivantes
-- ---------------------------------------------------------------------
create or replace function reverify_apply()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rec record; eid uuid;
  v_dead int := 0; v_live int := 0; v_caps int := 0;
  v_affected uuid[] := '{}'; v_uniq uuid[];
begin
  for rec in
    select rc.request_id, rc.url, rc.kind, resp.status_code
    from reverify_checks rc
    join net._http_response resp on resp.id = rc.request_id
    where rc.applied = false
      and rc.dispatched_at < now() - interval '1 minute'
  loop
    if rec.status_code in (404, 410) then
      -- preuve morte
      if rec.kind = 'docs' then
        for eid in select id from entities
                   where type='agent' and attributes->'docs.url'->>'value' = rec.url loop
          insert into change_events(entity_id, event_type, field, old_value, new_value, confidence, importance)
          values (eid, 'field_changed', 'docs.url',
                  (select attributes->'docs.url' from entities where id=eid), 'null'::jsonb, 'high', 3);
          update entities set attributes = attributes - 'docs.url' - 'llms_txt' where id = eid;
          v_affected := v_affected || eid; v_dead := v_dead + 1;
        end loop;
      else
        for eid in select distinct from_id from relations
                   where relation='has_capability' and evidence_level='observed'
                     and valid_to is null and evidence_url = rec.url loop
          insert into change_events(entity_id, event_type, field, old_value, new_value, confidence, importance)
          values (eid, 'capability_removed', 'has_capability', to_jsonb(rec.url), 'null'::jsonb, 'high', 2);
          update relations set valid_to = now()
           where from_id = eid and relation='has_capability' and evidence_level='observed'
             and valid_to is null and evidence_url = rec.url;
          v_affected := v_affected || eid; v_caps := v_caps + 1;
        end loop;
      end if;

    elsif rec.status_code between 200 and 399 then
      -- preuve vivante -> fraîcheur
      if rec.kind = 'docs' then
        update entities set last_verified_at = now()
          where type='agent' and attributes->'docs.url'->>'value' = rec.url;
      else
        update relations set last_seen_at = now()
          where relation='has_capability' and evidence_level='observed'
            and valid_to is null and evidence_url = rec.url;
        update entities e set last_verified_at = now()
          where exists (select 1 from relations r where r.from_id=e.id
                        and r.relation='has_capability' and r.valid_to is null and r.evidence_url = rec.url);
      end if;
      for eid in
        select id from entities where type='agent' and attributes->'docs.url'->>'value' = rec.url
        union
        select distinct from_id from relations
          where relation='has_capability' and valid_to is null and evidence_url = rec.url
      loop v_affected := v_affected || eid; end loop;
      v_live := v_live + 1;
    end if;
    -- 5xx / 429 / timeout / null : on ne dégrade pas (incident passager)

    update reverify_checks set applied = true where request_id = rec.request_id;
  end loop;

  select array_agg(distinct u) into v_uniq from unnest(v_affected) u;
  if v_uniq is not null then
    foreach eid in array v_uniq loop perform compute_agent_score(eid); end loop;
    perform refresh_rankings();
  end if;

  return jsonb_build_object('live_ok', v_live, 'docs_dead', v_dead,
                            'caps_removed', v_caps, 'affected', coalesce(array_length(v_uniq,1),0));
end $$;

revoke execute on function reverify_dispatch(int, interval) from public, anon, authenticated;
revoke execute on function reverify_apply() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Planification hebdo : lundi 03:00 dispatch, 03:15 apply
-- ---------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('electra-reverify-dispatch','electra-reverify-apply');
select cron.schedule('electra-reverify-dispatch', '0 3 * * 1',  $job$ select reverify_dispatch(); $job$);
select cron.schedule('electra-reverify-apply',    '15 3 * * 1', $job$ select reverify_apply();    $job$);
