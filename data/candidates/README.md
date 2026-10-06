# Sourcing — how to add new agents

The index already holds the obvious top agents (≈20 per theme). Sourcing from here is
about the **long tail**: newcomers, niche players, and **regional agents** (notably
French ones) that competitors miss. That coverage is a moat.

## The loop

1. **Collect candidates** → add rows to a CSV in this folder (one per batch, e.g.
   `fr_batch1.csv`). Columns:

   | column | required | notes |
   |---|---|---|
   | `name` | ✓ | product name as shown on its site |
   | `website` | ✓ | homepage URL |
   | `theme` | ✓ | one of the 10 valid themes below |
   | `country` | | e.g. FR, US — for our own tracking |
   | `source_url` | | where you found it (kept as provenance) |
   | `notes` | | one-line description, becomes the draft short description |

2. **Dedup + draft** → `python3 scripts/candidates_to_agents.py`
   Skips anything already in the index, writes `_draft_agents.json` for the new ones.

3. **Verify / enrich** each draft — honestly, every fact sourced (see checklist).

4. **Publish** → move verified records into `data/agents/<batch>.json`, run
   `python3 scripts/build_agents_seed.py`, then paste the regenerated
   `supabase/INSTALL_AGENTS_1.sql` into Supabase.

## The 10 valid themes (use the exact label)

`Coding` · `Research` · `Marketing` · `Sales` · `Customer Support` ·
`Finance` · `Data` · `Productivity` · `Browser & Computer Use` · `Business Operations`

## Verification checklist (the trust layer)

- **short_description** — what it does, in one sentence, from the vendor's own words.
- **capabilities** — concrete, from the site (not invented).
- **pricing** — read the pricing page; set `pricing_verified: true` only if you saw real
  numbers. No price published → `enterprise_quote` plan. Never guess a price.
- **api / mcp / open_source / github_repo** — only mark `true` if stated.
- **checked_at** — the date you verified it.

## Best sources to mine

**US / global:** Product Hunt (AI topics), Y Combinator launches, There's An AI For That,
Futurepedia, AI Agents Directory (aiagentsdirectory.com), a16z & Insight Partners agent
lists, agent registries (A2A registry, AWS Marketplace AI Agents), vendor "alternatives" pages.

**France:** France Digitale & franceisai ecosystem, Station F member directory, BPI/French
Tech startup lists, French AI tool roundups (blogs du dirigeant, etc.), LinkedIn FR AI
founders. Target French agents in Sales, Customer Support, Coding, Legal/BizOps, Marketing.
