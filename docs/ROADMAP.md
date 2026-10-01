# Electra Index — Roadmap (agreed 2026-10-01)

Positioning: **The trust & intelligence layer for the agent economy.** Electra recommends and routes; existing providers execute. Full vision: `docs/SPEC_TRUST_PAYMENTS.md`.

Rule that overrides the spec examples: **no source, no claim.** A metric we cannot observe yet (payment success rate, transaction latency) is shown as "Not measured yet", never estimated.

| Sprint | Scope | Reuses |
|---|---|---|
| 1 | Design/UX pass, SEO pack (sitemaps, robots, canonical, caching, noindex thin pages, OG images), Netlify + electraindex.com | web/ |
| 2 | Payment taxonomy: protocols x402, MPP, AP2, ACP, UCP; entity types `payment_provider`, `network`, `asset`; Payment Compatibility (declared, sourced); Trust Score v1 from observable sub-scores only | entities, relations, observations, methodologies |
| 3 | Electra MCP server (read-only) + public REST: search_agents, get_agent, compare_agents, get_trust_score, get_protocols, check_payment_compatibility | Supabase views, Edge Functions |
| 4 | Robot x402: discover paid endpoints, read the HTTP 402 payment requirements (price, asset, network) without paying, uptime probes → observed prices, Agent Service Price Index | crawl_runs, price_points, change_events |
| 5 | Router v0: compare_payment_routes / estimate_payment_cost from indexed data. No execution. | price_points, providers |
| later | Gateway integrations via licensed partners, transaction intelligence with consent, alerts (Pro), API keys | — |

Trust Score v1 (observable only): identity & company, transparency (public pricing, docs), protocol compliance (live probes), uptime (our probes), incident history (status pages, change events). Payment reliability and transaction success stay "not measured" until real transaction data exists.
