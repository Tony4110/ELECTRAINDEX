-- Price corrections 2026-10-14, checked by hand on each vendor's own pricing page.
-- record_price keeps history and logs the change; discontinue_price closes plans no longer offered.
-- Not changed on purpose (sources conflict or unreadable, review left open): Cursor, Agent Frank, Apollo.io.
do $$
declare
  S constant text := 'SRC-049';
  v uuid;
  n int := 0;
  fn_id text;
begin
  -- Creatify: plans renamed (Standard / Pro / Max / Business), prices as displayed (annual plan, "save 20%")
  select id into v from entities where type = 'agent' and name = 'Creatify';
  if v is not null then
    perform discontinue_price(v, 'Starter', S, 'https://creatify.ai/pricing');
    perform record_price(v, 'Standard', 'subscription', 12, 'USD', 'month', S, null, false, 'https://creatify.ai/pricing');
    perform record_price(v, 'Pro', 'subscription', 44, 'USD', 'month', S, null, false, 'https://creatify.ai/pricing');
    perform record_price(v, 'Max', 'subscription', 76, 'USD', 'month', S, null, false, 'https://creatify.ai/pricing');
    perform record_price(v, 'Business', 'subscription', 156, 'USD', 'month', S, null, false, 'https://creatify.ai/pricing');
    perform record_price(v, 'API Starter', 'subscription', 99, 'USD', 'month', S, null, false, 'https://creatify.ai/pricing');
    perform record_price(v, 'API Pro', 'subscription', 299, 'USD', 'month', S, null, false, 'https://creatify.ai/pricing');
    n := n + resolve_price_reviews(v);
  end if;

  -- Lindy: now Free / Team / Enterprise
  select id into v from entities where type = 'agent' and name = 'Lindy';
  if v is not null then
    perform discontinue_price(v, 'Plus', S, 'https://www.lindy.ai/pricing');
    perform discontinue_price(v, 'Pro', S, 'https://www.lindy.ai/pricing');
    perform discontinue_price(v, 'Max', S, 'https://www.lindy.ai/pricing');
    perform record_price(v, 'Free', 'free', 0, 'USD', 'month', S, '$50 in credits', false, 'https://www.lindy.ai/pricing');
    perform record_price(v, 'Team', 'subscription', 49.99, 'USD', 'month', S, '5,000 credits', false, 'https://www.lindy.ai/pricing');
    n := n + resolve_price_reviews(v);
  end if;

  -- Cora by Every: $15 plan gone, Professional $20 and Unlimited $39 per month
  select id into v from entities where type = 'agent' and name = 'Cora by Every';
  if v is not null then
    perform discontinue_price(v, cp.plan_name, S, 'https://cora.computer')
       from v_current_prices cp where cp.entity_id = v and cp.amount = 15;
    perform record_price(v, 'Professional', 'subscription', 20, 'USD', 'month', S, null, false, 'https://cora.computer');
    perform record_price(v, 'Unlimited', 'subscription', 39, 'USD', 'month', S, null, false, 'https://cora.computer');
    n := n + resolve_price_reviews(v);
  end if;

  -- OpenBB Workspace: Lite is now $2,400 per year (team license)
  select id into v from entities where type = 'agent' and name = 'OpenBB Workspace';
  if v is not null then
    perform record_price(v, 'Lite (annual)', 'subscription', 2400, 'USD', 'year', S, null, false, 'https://openbb.co/pricing/');
    n := n + resolve_price_reviews(v);
  end if;

  -- Consensus: pricing moved to consensus.app/pricing/ ; Premium replaced by Pro and Deep, Teams on quote
  select id into v from entities where type = 'agent' and name = 'Consensus';
  if v is not null then
    perform record_observation(v, 'pricing.url', to_jsonb('https://consensus.app/pricing/'::text), 'observed', S, 'high', 'https://help.consensus.app/en/articles/10087865-subscription-plans');
    perform discontinue_price(v, 'Premium', S, 'https://help.consensus.app/en/articles/10087865-subscription-plans');
    perform record_price(v, 'Pro', 'subscription', 20, 'USD', 'month', S, null, false, 'https://help.consensus.app/en/articles/10087865-subscription-plans');
    perform record_price(v, 'Deep', 'subscription', 65, 'USD', 'month', S, null, false, 'https://help.consensus.app/en/articles/10087865-subscription-plans');
    perform record_price(v, 'Teams', 'enterprise_quote', null, null, null, S, null, false, 'https://consensus.app/pricing/team/');
    n := n + resolve_price_reviews(v);
  end if;

  -- Fabi.ai: pricing now in the docs; Team plan added
  select id into v from entities where type = 'agent' and name = 'Fabi.ai';
  if v is not null then
    perform record_observation(v, 'pricing.url', to_jsonb('https://docs.fabi.ai/admin_and_configuration/pricing_and_billing'::text), 'observed', S, 'high', 'https://docs.fabi.ai/admin_and_configuration/pricing_and_billing');
    perform record_price(v, 'Builder', 'seat', 39, 'USD', 'month', S, 'seat', false, 'https://docs.fabi.ai/admin_and_configuration/pricing_and_billing');
    perform record_price(v, 'Team', 'seat', 50, 'USD', 'month', S, 'seat', false, 'https://docs.fabi.ai/admin_and_configuration/pricing_and_billing');
    n := n + resolve_price_reviews(v);
  end if;

  -- Confirmed unchanged on the vendor page today: refresh "last confirmed", close the robot's reviews
  for v in select id from entities where type = 'agent' and name in (
      'Airtop', 'Agentforce Service', 'Agentforce Sales (SDR Agent)', 'n8n', 'Surfer', 'Tavily', 'Qodo', 'Spark Mail',
      'Otter.ai', 'Notion Agent', 'Fin AI Agent', 'Gemini Deep Research', 'Dust', 'Superhuman Mail', 'Lovable', 'Exa',
      'Kosmos', 'Gong AI Agents') loop
    update price_points pp set last_confirmed_at = now()
      where pp.entity_id = v and pp.id in (select distinct on (lower(plan_name)) id from price_points
                                             where entity_id = v order by lower(plan_name), observed_at desc);
    update entities set last_verified_at = now() where id = v;
    n := n + resolve_price_reviews(v);
  end loop;

  raise notice 'reviews closed: %', n;
end $$;
