-- ELECTRA INDEX — PROCESS_SUBMISSIONS_27 : Quest (AI app, New Quest AI Inc.) — added on Tony's request, 27 Nov 2026
--  Listed in AI apps (/apps), theme Coaching & personal growth — a consumer app, so it never enters the agent rankings.
--  Researched 27 Nov 2026:
--   * Personal AI advisor "Q." in iMessage, text and voice; connects email, calendar, location and health data
--     (with permission); turns goals ("quests") into plans with check-ins and custom mini-apps.
--   * Publisher: New Quest AI Inc., San Francisco (United States). Website new.quest.
--   * Price: free on the Apple App Store ("Quest: Personal AI Advisor", id6763097866). No paid plan published.
--     Read from the App Store listing as reported by Toolradar and Dealroom (Nov 2026): marked as declared, not verified.
--   * Apple devices only (iPhone, iPad, Mac, Vision Pro).
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

select ingest_apps($apps$[{"name": "Quest", "company": "New Quest AI Inc.", "country": "United States", "website": "https://new.quest",
  "pricing_url": "https://apps.apple.com/us/app/quest-personal-ai-advisor/id6763097866", "theme": "coaching", "platforms": ["ios"],
  "short_description": "Personal AI advisor that lives in iMessage, text and voice. With your permission it connects email, calendar, location and health data, turns your goals into plans and follows up with check-ins.",
  "free_plan": true,
  "plans": [{"plan": "Free", "billing_model": "free", "amount": 0, "currency": "USD", "interval": "month", "unit": "App Store, no paid plan published", "is_trial": false}],
  "checked_at": "2026-11-27", "pricing_verified": false}]$apps$::jsonb);

select i18n_set('app', (select e.slug from entities e where e.type = 'app' and e.website ilike '%new.quest%' order by e.first_seen_at desc limit 1), 'fr', 'short_description',
  'Conseiller IA personnel dans iMessage, par SMS et à la voix. Avec votre accord, il se connecte à l''e-mail, l''agenda, la localisation et la santé, transforme vos objectifs en plans et assure le suivi.',
  'Personal AI advisor that lives in iMessage, text and voice. With your permission it connects email, calendar, location and health data, turns your goals into plans and follows up with check-ins.');

select e.slug as page, 'https://electraindex.com/apps/' || e.slug as url, e.is_published
  from entities e where e.type = 'app' and e.website ilike '%new.quest%';
