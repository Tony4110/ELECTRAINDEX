-- Smoke test of the engine rules. Runs inside a transaction and rolls back.
\set ON_ERROR_STOP on
begin;
create temp table t_ids(k text primary key, id uuid);

-- 1. Discovery: same agent seen from 2 sources -> ONE entity
insert into t_ids values ('cursor', resolve_entity('agent','Cursor',
  '[{"type":"domain","value":"https://www.cursor.com/pricing"}]','SRC-001','https://cursor.com','AI code editor agent'));
insert into t_ids values ('cursor2', resolve_entity('agent','Cursor Agent',
  '[{"type":"domain","value":"cursor.com"},{"type":"github_repo","value":"https://github.com/getcursor/cursor"}]','SRC-018'));
do $$ begin
  assert (select count(*) from entities where type='agent') = 1, 'dedupe failed';
  assert (select id from t_ids where k='cursor') = (select id from t_ids where k='cursor2'), 'alias resolution failed';
  assert (select count(*) from entity_aliases) = 2, 'aliases not stored';
  assert (select count(*) from change_events where event_type='new_entity') = 1, 'new_entity event';
end $$;

-- 2. Observations: first value = no change event; same value = no new row; new value = change event
select record_observation((select id from t_ids where k='cursor'),'protocol.mcp','false','observed','SRC-900','high');
select record_observation((select id from t_ids where k='cursor'),'protocol.mcp','false','observed','SRC-900','high');
select record_observation((select id from t_ids where k='cursor'),'protocol.mcp','true','observed','SRC-900','high');
do $$ begin
  assert (select count(*) from observations where field='protocol.mcp') = 2, 'append-only / dedupe of same value';
  assert (select count(*) from change_events where event_type='protocol_added') = 1, 'protocol_added event';
  assert (select attributes->'protocol.mcp'->>'value' from entities where slug='cursor') = 'true', 'current state';
end $$;
-- declared value must not overwrite an observed one
select record_observation((select id from t_ids where k='cursor'),'protocol.mcp','false','declared','SRC-001','medium');
do $$ begin
  assert (select attributes->'protocol.mcp'->>'evidence' from entities where slug='cursor') = 'observed', 'evidence ranking';
end $$;
-- unknown is not a value
do $$ begin
  begin perform record_observation((select id from t_ids where k='cursor'),'protocol.a2a','null','observed','SRC-900');
        raise exception 'should have failed';
  exception when others then if sqlerrm = 'should have failed' then raise; end if; end;
end $$;

-- 3. Prices: history + increase/decrease events
select record_price((select id from t_ids where k='cursor'),'Pro','subscription',20,'USD','month','SRC-900');
select record_price((select id from t_ids where k='cursor'),'Pro','subscription',20,'USD','month','SRC-900');
select record_price((select id from t_ids where k='cursor'),'Pro','subscription',16,'USD','month','SRC-900');
select record_price((select id from t_ids where k='cursor'),'Hobby','free',0,'USD','month','SRC-900');
do $$ begin
  assert (select count(*) from price_points) = 3, 'price history rows';
  assert (select count(*) from change_events where event_type='price_decrease') = 1, 'price_decrease';
  assert (select count(*) from change_events where event_type='plan_added') = 1, 'plan_added';
  assert (select amount from v_current_prices where plan_name='Pro') = 16, 'current price view';
end $$;

-- 4. NO SOURCE -> NO CLAIM / NO HISTORY -> NO CHANGE CLAIM (constraints)
do $$ begin
  begin insert into observations(entity_id,field,value,evidence_level,source_id)
        values ((select id from entities where slug='cursor'),'x','1','observed',null);
        raise exception 'should have failed';
  exception when not_null_violation then null; end;
  begin insert into change_events(entity_id,event_type,new_value)
        values ((select id from entities where slug='cursor'),'price_increase','1');
        raise exception 'should have failed';
  exception when check_violation then null; end;
end $$;

-- 5. Graph + task matching
select link((select id from t_ids where k='cursor'),'has_capability',(select id from entities where type='capability' and slug='code-generation'),'declared','SRC-001');
select link((select id from t_ids where k='cursor'),'has_capability',(select id from entities where type='capability' and slug='debugging'),'observed','SRC-900');
select link((select id from t_ids where k='cursor'),'in_category',(select id from entities where type='category' and slug='coding'),'declared','SRC-000');
update entities set is_published=true, status='active' where slug='cursor';
do $$ begin
  assert (select count(*) from change_events where event_type='capability_added') = 1, 'capability_added';
  assert (select coverage_pct from v_task_matches where task_slug='fix-bugs-in-a-codebase' and agent_slug='cursor') = 100, 'task coverage';
end $$;

-- 6. Momentum: 1 point = nothing ; 2 points = a real variation
select record_metric((select id from t_ids where k='cursor'),'github_stars',1000,'SRC-018', now() - interval '5 days');
do $$ begin assert compute_momentum((select id from entities where slug='cursor'),'github_stars','7d') is null, 'baseline rule'; end $$;
select record_metric((select id from t_ids where k='cursor'),'github_stars',1200,'SRC-018');
do $$ begin
  assert compute_momentum((select id from entities where slug='cursor'),'github_stars','7d') is not null, 'momentum';
  assert (select pct_change from momentum_history) = 20, 'pct change';
end $$;

-- 7. Score
select record_observation((select id from t_ids where k='cursor'),'docs.url','"https://docs.cursor.com"','observed','SRC-900');
select compute_agent_score((select id from t_ids where k='cursor'));
select slug, name, company, categories, mcp, api, a2a, from_usd_month, has_free, agent_score, score_confidence from v_agents;
select score, confidence, components->'missing' as missing, components->'components' as components from score_history;

-- 8. Search
select name, type, round(rank::numeric,3) rank from search_entities('lead generation') limit 5;

-- 9. RLS: anon sees published data only, no internal tables
set local role anon;
do $$ begin
  assert (select count(*) from entities where type='agent') = 1, 'anon sees published agent';
  assert (select count(*) from review_queue) = 0, 'anon must not see review_queue';
  assert (select count(*) from snapshots) = 0, 'anon must not see snapshots';
  begin perform record_price((select id from entities where slug='cursor'),'X','free',0,'USD','month','SRC-900');
        raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'ALL ENGINE TESTS PASSED' as result;
rollback;
