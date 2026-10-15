-- Price corrections 2026-10-15 (second batch), checked on each vendor's own pages.
-- Left open on purpose: Manus (help page and live page disagree), Typeface (no public price found).
do $$
declare S constant text := 'SRC-049'; v uuid; n int := 0;
begin
  -- Cline: new paid plan ClinePass
  select id into v from entities where type = 'agent' and name = 'Cline';
  if v is not null then
    perform record_price(v, 'ClinePass', 'subscription', 9.99, 'USD', 'month', S, 'open-weight models', false, 'https://cline.bot/cline-pass');
    n := n + resolve_price_reviews(v);
  end if;
  -- MailMaestro: plans (monthly-billed prices; annual-billed are lower)
  select id into v from entities where type = 'agent' and name = 'MailMaestro';
  if v is not null then
    perform record_price(v, 'Free', 'free', 0, 'USD', 'month', S, null, false, 'https://www.maestrolabs.com/pricing');
    perform record_price(v, 'MailMaestro Pro', 'seat', 15, 'USD', 'month', S, 'seat', false, 'https://www.maestrolabs.com/llms.txt');
    perform record_price(v, 'TeamsMaestro Pro', 'seat', 20, 'USD', 'month', S, 'seat', false, 'https://www.maestrolabs.com/llms.txt');
    perform record_price(v, 'MaestroDuo', 'seat', 27, 'USD', 'month', S, 'seat', false, 'https://www.maestrolabs.com/llms.txt');
    perform record_price(v, 'Enterprise', 'enterprise_quote', null, null, null, S, null, false, 'https://www.maestrolabs.com/pricing');
    n := n + resolve_price_reviews(v);
  end if;
  -- You.com Research API: default (standard) tier
  select id into v from entities where type = 'agent' and name = 'You.com Research API';
  if v is not null then
    perform record_price(v, 'Research API (standard)', 'usage', 50, 'USD', 'per_unit', S, '1,000 calls (default tier)', false, 'https://you.com/docs/administration/billing');
    n := n + resolve_price_reviews(v);
  end if;
  -- Botpress: new "Built For You" plan
  select id into v from entities where type = 'agent' and name = 'Botpress';
  if v is not null then
    perform record_price(v, 'Built For You', 'subscription', 1650, 'USD', 'month', S, null, false, 'https://botpress.com/blog');
  end if;
  -- Confirmed unchanged today
  for v in select id from entities where type = 'agent' and name in
      ('Chatbase', 'Apify', 'AdCreative.ai', 'Tipalti', 'Zeni', 'Ramp (AI agents)', 'Botpress', 'Gong AI Agents') loop
    update price_points pp set last_confirmed_at = now()
     where pp.entity_id = v and pp.id in (select distinct on (lower(plan_name)) id from price_points
                                            where entity_id = v order by lower(plan_name), observed_at desc);
    update entities set last_verified_at = now() where id = v;
    n := n + resolve_price_reviews(v);
  end loop;
  raise notice 'reviews closed: %', n;
end $$;
