-- ELECTRA INDEX — PROCESS_SUBMISSIONS_26 : "List your agent" request of 25 Nov 2026 — Prelulu (AI app)
--  Listed in AI apps (/apps), theme Entertainment & chat — not an agent, so it never enters the agent rankings.
--  Researched on its official pages, 25 Nov 2026:
--   * Chat with AI characters by text, voice or live video call (own avatar model); characters remember you;
--     create your own characters and story scenes.
--   * Publisher: TheInfluence, Inc. ("Made in San Francisco", United States). Privacy policy published.
--   * Prices (USD, web, billed yearly): Plus $71.88/yr, Premium $215.88/yr, Muse $719.88/yr. Free to start
--     (daily free messages, welcome credits). Credit packs $3.99 to $99.99. Monthly prices not clearly shown: not recorded.
--  When it becomes "listed", the publisher email leaves automatically.
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

select ingest_apps($apps$[{"name": "Prelulu", "company": "TheInfluence, Inc.", "country": "United States", "website": "https://prelulu.ai",
  "pricing_url": "https://prelulu.ai/pricing", "privacy_url": "https://prelulu.ai/privacy", "theme": "entertainment", "platforms": ["web", "ios", "android"],
  "short_description": "Talk with AI characters by text, voice or live video call, on the publisher's own avatar model. Characters remember you, and you can create your own characters and story scenes.",
  "free_plan": true,
  "plans": [
    {"plan": "Free", "billing_model": "free", "amount": 0, "currency": "USD", "interval": "month", "unit": "daily free messages and welcome credits", "is_trial": false},
    {"plan": "Plus", "billing_model": "subscription", "amount": 71.88, "currency": "USD", "interval": "year", "unit": "180 min voice or 60 min video a month, 7,200 credits", "is_trial": false},
    {"plan": "Premium", "billing_model": "subscription", "amount": 215.88, "currency": "USD", "interval": "year", "unit": "555 min voice or 185 min video a month, 22,200 credits", "is_trial": false},
    {"plan": "Muse", "billing_model": "subscription", "amount": 719.88, "currency": "USD", "interval": "year", "unit": "2,160 min voice or 720 min video a month, 86,400 credits", "is_trial": false}],
  "checked_at": "2026-11-25", "pricing_verified": true}]$apps$::jsonb);

select i18n_set('app', (select e.slug from entities e where e.type = 'app' and e.website ilike '%prelulu.ai%' order by e.first_seen_at desc limit 1), 'fr', 'short_description',
  'Parlez avec des personnages IA par écrit, en appel vocal ou en appel vidéo en direct, sur le modèle d''avatar de l''éditeur. Les personnages se souviennent de vous, et vous pouvez créer vos propres personnages et scènes.',
  'Talk with AI characters by text, voice or live video call, on the publisher''s own avatar model. Characters remember you, and you can create your own characters and story scenes.');

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select e.id from entities e where e.type = 'app' and e.website ilike '%prelulu.ai%' order by e.first_seen_at desc limit 1)
 where s.status in ('new', 'duplicate') and s.website ilike '%prelulu.ai%';

select s.name, s.kind, s.status, e.slug as page,
       (select count(*) from entities x where x.type = 'app' and x.is_published) as apps_total,
       (select n.subject from notify_log n where n.kind = 'publisher_listed' and n.recipient = s.contact_email order by n.created_at desc limit 1) as email_sent
  from submissions s left join entities e on e.id = s.entity_id
 where s.website ilike '%prelulu.ai%';
