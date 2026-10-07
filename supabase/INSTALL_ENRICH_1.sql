-- =====================================================================
--  ELECTRA — INSTALL_ENRICH_1 : enrich_agents(jsonb)
--  Applies the manual Top-50 verification: records docs URL, llms.txt and
--  human-in-the-loop as VERIFIED observations (with the page URL as source +
--  today's date), upgrades the agent's capabilities from declared to VERIFIED
--  (cited to the features page), refreshes last_verified_at, and recomputes the
--  score. No source → nothing recorded (blanks are simply skipped = Unknown).
--  Paste once. Then apply data with:  select enrich_agents($$[ ... ]$$::jsonb);
-- =====================================================================

create or replace function enrich_agents(p jsonb) returns jsonb language plpgsql as $$
declare
  r jsonb; v_id uuid; v_slug text; v_done int := 0; v_miss int := 0;
  v_rows jsonb := '[]'::jsonb; v_llms text; v_hil text;
begin
  for r in select jsonb_array_elements(p) loop
    v_slug := r->>'slug';
    select id into v_id from entities where type = 'agent' and slug = v_slug;
    if v_id is null then
      v_miss := v_miss + 1;
      v_rows := v_rows || jsonb_build_object('slug', v_slug, 'status', 'not_found');
      continue;
    end if;

    -- Documentation URL (Documentation component: 70 pts)
    if coalesce(r->>'docs_url','') <> '' then
      perform record_observation(v_id, 'docs.url', to_jsonb(r->>'docs_url'),
                                 'observed', 'SRC-049', 'high', r->>'docs_url', 'documentation review');
    end if;

    -- llms.txt present? (Documentation component: +30 pts)
    v_llms := lower(coalesce(r->>'llms_txt',''));
    if v_llms in ('yes','y','true','oui') then
      perform record_observation(v_id, 'llms_txt', to_jsonb(true),  'observed', 'SRC-049', 'high', r->>'docs_url');
    elsif v_llms in ('no','n','false','non') then
      perform record_observation(v_id, 'llms_txt', to_jsonb(false), 'observed', 'SRC-049', 'high', r->>'docs_url');
    end if;

    -- Human-in-the-loop (Human oversight component)
    v_hil := lower(coalesce(r->>'human_in_the_loop',''));
    if v_hil in ('yes','y','true','oui') then
      perform record_observation(v_id, 'human_approval', to_jsonb(true),  'observed', 'SRC-049', 'high', coalesce(r->>'capabilities_source_url', r->>'docs_url'));
    elsif v_hil in ('no','n','false','non') then
      perform record_observation(v_id, 'human_approval', to_jsonb(false), 'observed', 'SRC-049', 'high', coalesce(r->>'capabilities_source_url', r->>'docs_url'));
    end if;

    -- Capabilities confirmed on the cited page -> upgrade declared to observed (shown as Verified)
    if coalesce(r->>'capabilities_source_url','') <> '' then
      update relations
         set evidence_level = 'observed', confidence = 'high',
             source_id = source_id_of('SRC-049'),
             evidence = 'confirmed on vendor features/docs page',
             evidence_url = r->>'capabilities_source_url', last_seen_at = now()
       where from_id = v_id and relation = 'has_capability'
         and valid_to is null and evidence_level = 'declared';
    end if;

    -- Freshness: re-verified today
    update entities set last_verified_at = now() where id = v_id;

    perform compute_agent_score(v_id);
    v_done := v_done + 1;
    v_rows := v_rows || jsonb_build_object('slug', v_slug, 'status', 'enriched');
  end loop;

  perform refresh_rankings();
  return jsonb_build_object('enriched', v_done, 'not_found', v_miss, 'rows', v_rows);
end $$;

revoke execute on function enrich_agents(jsonb) from public, anon, authenticated;

-- =====================================================================
--  USAGE (une fois la fonction créée) — exemple :
--  select enrich_agents($$[
--    {"slug":"cursor","docs_url":"https://docs.cursor.com","llms_txt":"no",
--     "capabilities_source_url":"https://www.cursor.com/features",
--     "human_in_the_loop":"yes"}
--  ]$$::jsonb);
--  -> renvoie {"enriched":N,"not_found":M,"rows":[...]}  (lance sur 5 agents d'abord)
-- =====================================================================
