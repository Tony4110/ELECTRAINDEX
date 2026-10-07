# Top-50 enrichment — verification protocol

Goal: turn the top agents from `declared` to `verified`, and fill the data gaps
(Documentation, Human oversight, Integrations) — honestly. **Only record what you
actually see on the site. A blank cell = Unknown. Never guess.**

Budget: ~5–8 min per agent. Do them in batches (even 5–10 at a time is useful).

## The 7 steps, per agent

1. **Open the vendor site** (the `website` we have).
2. **Docs URL** → find the official documentation link (often "Docs", "Developers",
   "Documentation"). Put it in `docs_url` (e.g. `https://docs.cursor.com`). None found → leave blank.
3. **llms.txt** → in the browser, open `https://<their-domain>/llms.txt`.
   Loads a real text file → `llms_txt = yes`. 404 / nothing → `no`.
4. **Capabilities source** → open the page that lists what the agent does
   (Features / Product / Use cases). Paste that exact URL in `capabilities_source_url`.
   **This citation is what upgrades its capabilities from Declared → Verified.**
   If the real features differ from what the site shows today, note it in `notes`.
5. **Human-in-the-loop** → search the site/docs for "approval", "review", "human in the
   loop", "autonomy", "guardrails". Documented control exists → `yes`. Clearly fully
   autonomous with no control → `no`. Not found → leave blank (Unknown).
6. **Integrations** → from an "Integrations" page, list the named ones, separated by `;`
   (e.g. `GitHub;GitLab;Slack;Jira`). Up to ~10. None listed → leave blank.
7. **Pricing** → if real prices are visible on the pricing page → `pricing_verified = yes`.
   Only "contact us" / hidden → `no`.

## The golden rule

- You **saw it** on the vendor's own page → record it (it becomes **Verified**, with that
  URL as the source and today's date).
- You **didn't find it** → leave blank → stays **Unknown** (never counted as a failure,
  never invented).

## File

Fill `data/enrichment/top50.csv` (copy `_template.csv`). Columns:

`slug, name, docs_url, llms_txt, capabilities_source_url, human_in_the_loop, integrations, pricing_verified, notes`

Send it back (or drop it here) and the `enrich_agents()` SQL will apply it: it records
each observation with its real source + date, marks the confirmed items **Verified**,
sets `last_verified_at` to today, and recomputes the scores.
