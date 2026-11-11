-- ELECTRA INDEX — PROCESS_SUBMISSIONS_15 : "List your agent" request of 11 Nov 2026 — Speakuma (submitted as "agent")
--  Listed as an AI APP (consumer app, theme "learning"), checked on its site 11 Nov 2026:
--   * live in the browser, free beta: ¥0, 20 AI conversation turns a day, no card, no paid plan sold yet (speakuma.com/pricing);
--   * publisher: Fronami, Inc., Delaware corporation, United States (speakuma.com/about);
--   * privacy policy: speakuma.com/privacy.
--  Status "listed" sends the standard listing email automatically (with the free "Listed on Electra Index" badge).
-- Paste everything in Supabase > SQL Editor > Run. Re-runnable.

select ingest_app('{"name": "Speakuma", "company": "Fronami, Inc.", "country": "United States", "website": "https://speakuma.com", "pricing_url": "https://speakuma.com/pricing", "privacy_url": "https://speakuma.com/privacy", "theme": "learning", "platforms": ["web"], "short_description": "English speaking practice for Japanese adult learners: study expressions, then role-play everyday scenes with an AI partner, with Japanese hints, slow playback and feedback.", "free_plan": true, "plans": [{"plan": "Free beta", "billing_model": "free", "amount": 0, "currency": "USD", "interval": "month", "unit": "20 AI conversation turns a day", "is_trial": false}], "checked_at": "2026-11-11", "pricing_verified": true}'::jsonb);

select i18n_set('app', (select slug from entities where type = 'app' and name = 'Speakuma' and is_published limit 1), 'fr', 'short_description',
  'Pratique de l''anglais oral pour adultes japonais : apprendre des expressions, puis jouer des scènes du quotidien avec un partenaire IA, avec aides en japonais, lecture ralentie et retours.',
  'English speaking practice for Japanese adult learners: study expressions, then role-play everyday scenes with an AI partner, with Japanese hints, slow playback and feedback.');

update submissions s set status = 'listed', reviewed_at = now(),
       entity_id = (select id from entities where type = 'app' and name = 'Speakuma' and is_published limit 1)
 where s.status = 'new' and s.website ilike '%speakuma.com%';

select s.name, s.status, 'https://electraindex.com/apps/' || a.slug as page, a.company, a.country, a.theme, a.has_free
  from submissions s left join v_apps a on a.id = s.entity_id
 where s.website ilike '%speakuma.com%';
