-- Intendex — engine config + Agent Score methodology v1.0
insert into engine_config(key, value) values
  ('vertical',        '"intendex"'),
  ('engine_version',  '"0.1"'),
  ('public_language', '"en"'),
  ('publish_rules',   '{"min_confidence":"medium","min_sources":1,"require_verified_within_days":90}')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Agent Score v1.0 — weights sum to 100.
-- Reliability is 0 until our own probes produce uptime data (never scored from vendor claims).
-- Its 20 points from the original brief are redistributed: capability +5, integration +5,
-- documentation +5, pricing +5.
insert into methodologies(code, version, label, weights, description, published_at, is_current) values
('agent_score', '1.0', 'Agent Score v1.0',
 '{"capability":25,"integration":20,"documentation":15,"pricing":15,"transparency":10,"freshness":10,"human_oversight":5,"reliability":0}',
 'Measures the coverage and quality of OBSERVABLE public data about an agent, per this published methodology. It is not a guarantee of performance. Missing data scores 0 on its component and lowers the confidence level.',
 now(), true),
('agent_price_index', '0.1', 'Agent Economy Price Index (draft)',
 '{"base":100,"method":"like-for-like median price change of plans observed on both dates","min_constituents":50}',
 'Based on observed public pricing data only. Not published until at least 50 like-for-like plans exist.',
 null, true)
on conflict (code, version) do nothing;
