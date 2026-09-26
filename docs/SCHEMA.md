# Schema map — engine v0.1

```
SOURCES ──────────────┐ every fact points to a source
                      ▼
ENTITIES ◄── ENTITY_ALIASES      (dedupe: domain, repo, npm, pypi, mcp id, agent-card url)
   │  type = agent | mcp_server | tool | model | company | integration
   │         task | capability | category | protocol | ad_agent
   │
   ├── RELATIONS (typed graph)   task ─requires_capability→ capability ←has_capability─ agent
   │                             agent ─in_category / made_by / uses_model / integrates_with / exposes_mcp→ …
   ├── OBSERVATIONS              one fact per row, append-only (declared / observed / derived)
   ├── PRICE_POINTS              append-only price history
   ├── METRIC_POINTS             numeric series (stars, downloads, uptime) → MOMENTUM_HISTORY
   ├── CHANGE_EVENTS             signals, created automatically by the functions
   └── SCORE_HISTORY             versioned by METHODOLOGIES (+ INDEX_VALUES for market indexes)

CRAWL_RUNS → SNAPSHOTS           bot runs and raw evidence (Storage)
REVIEW_QUEUE                     what a human must check (possible duplicates…)
SEARCH_QUERIES, OUTBOUND_CLICKS  demand & intent (no personal data) → future ad-network asset
ENGINE_CONFIG                    vertical settings
```

| Table | Public (anon) | Written by |
|---|---|---|
| entities, relations, observations, price_points, metric_points, score_history, momentum_history | published rows only | functions (service role) |
| change_events | published only | functions |
| sources | active only | seed |
| entity_types, relation_types, methodologies, index_values | yes | seed / scoring job |
| entity_aliases, crawl_runs, snapshots, review_queue, search_queries, outbound_clicks, engine_config | no | bots / server |
