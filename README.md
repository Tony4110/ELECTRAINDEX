# Intendex — moteur d'index (engine v0.1)

Index de l'économie des agents IA : agents, serveurs MCP, A2A, prix, capacités, historique.
Même moteur réutilisable pour Longevity Index, Discern… : **un projet Supabase par actif, mêmes migrations, seeds différents.**

## Contenu du dossier

```
supabase/migrations/   schéma du moteur (à exécuter dans l'ordre)
  0001_engine_core.sql              tables
  0002_engine_functions.sql         fonctions appelées par les robots
  0003_scoring_views_security.sql   Agent Score, vues publiques, RLS
supabase/seed/         données de départ propres à Intendex
  0100_sources.sql                  85 sources de la Source Map + 2 internes
  0101_intendex_taxonomy.sql        10 catégories, 9 protocoles, 50 capacités, 100 tâches
  0102_methodology_config.sql       Agent Score v1.0 + config
data/source_map.csv    Source Map (source de vérité des sources)
scripts/build_seeds.py régénère les seeds depuis le CSV et la taxonomie
scripts/local_test.sh  reconstruit une base locale et lance les tests
tests/test_engine.sql  tests des règles (dédoublonnage, historique, prix, score, RLS)
docs/SCHEMA.md         carte des tables
.cursorrules           règles que l'agent Cursor doit respecter
```

## Installation sur Supabase (10 min)

1. Créer un **nouveau projet Supabase dédié** (région Frankfurt, comme Alcyone).
2. SQL Editor → coller et exécuter, dans cet ordre :
   `0001` → `0002` → `0003` → `0100` → `0101` → `0102`.
   (Ne **pas** exécuter `tests/00_local_supabase_roles.sql` sur Supabase : ces rôles y existent déjà.)
3. Vérifier : `select type, count(*) from entities group by type;` → 50 capability, 10 category, 9 protocol, 100 task.
4. Copier `.env.example` en `.env.local` et coller l'URL du projet, la clé anon et la clé service_role (Settings → API).
   La clé **service_role** ne va que dans les robots côté serveur (Edge Functions), jamais dans le navigateur.

## Les règles de données (appliquées par la base elle-même)

| Règle | Comment |
|---|---|
| Pas de source → pas d'affirmation | `source_id NOT NULL` sur chaque fait, prix et lien |
| Pas de preuve → inconnu | on n'enregistre jamais `null` ; absence de ligne = inconnu, jamais « non » |
| Pas d'historique → pas de variation | un événement de changement exige l'ancienne valeur ; la momentum exige ≥ 2 points |
| Déclaré / Observé / Déduit séparés | `evidence_level` partout ; « observé » l'emporte sur « déclaré » |
| Score ≠ Momentum | `score_history` et `momentum_history` sont deux tables séparées (règle Alcyone) |
| Méthodologie versionnée | chaque score porte `methodology_version` et sa confiance |

## Comment un robot écrit dans la base

Les robots n'écrivent jamais directement dans les tables : ils appellent 5 fonctions.

```sql
-- 1. Discovery : trouver ou créer (dédoublonne par domaine, repo GitHub, package npm…)
select resolve_entity('agent', 'Cursor',
  '[{"type":"domain","value":"cursor.com"},{"type":"github_repo","value":"getcursor/cursor"}]',
  'SRC-018');

-- 2. Verification / Capability : un fait = une observation (historique + détection de changement)
select record_observation(:agent_id, 'protocol.mcp', 'true', 'observed', 'SRC-900', 'high');

-- 3. Pricing : historique des prix + événements hausse/baisse
select record_price(:agent_id, 'Pro', 'subscription', 20, 'USD', 'month', 'SRC-900');

-- 4. Graphe : agent → capacité / tâche / catégorie / entreprise
select link(:agent_id, 'has_capability', :capability_id, 'declared', 'SRC-001');

-- 5. Séries (étoiles GitHub, téléchargements…) puis momentum
select record_metric(:agent_id, 'github_stars', 1200, 'SRC-018');
select compute_momentum(:agent_id, 'github_stars', '30d');   -- null si < 2 points

-- Score
select compute_agent_score(:agent_id);
```

Champs d'observation standard : `protocol.api`, `protocol.mcp`, `protocol.a2a`, `protocol.webhook`, `protocol.sdk`,
`open_source`, `docs.url`, `llms_txt`, `human_approval`, `deployment.self_host`, `status.online`, `version`.

## Vues pour le site et l'API

- `v_agents` — fiche agent (catégories, entreprise, API/MCP/A2A : vrai / faux / inconnu, prix d'entrée, gratuit, score)
- `v_task_matches` — **tâche → capacités → agents**, avec % de couverture (le cœur du « What do you need to do? »)
- `v_current_prices` — dernier prix par plan
- `v_latest_scores` — dernier score par entité
- `v_signals` — événements publiés (/signals)
- `search_entities('lead generation')` — recherche texte + tolérance aux fautes

## Tester en local

```bash
PGHOST=/tmp PGPORT=5433 PGUSER=postgres scripts/local_test.sh
# → ALL ENGINE TESTS PASSED
```

## Prochaines étapes

1. Robots P0 en Edge Functions + cron : MCP Registry, GitHub, npm, PyPI, sonde A2A.
2. 100–200 premières fiches, puis publication (`is_published`) selon `publish_rules`.
3. Pages SEO (Next.js) branchées sur les vues.

## Robot #1 — Discovery · Official MCP Registry

Récupère tous les serveurs MCP publiés sur registry.modelcontextprotocol.io (dernière version de chacun)
et les enregistre via `ingest_mcp_servers()` : dédoublonnage, historique, événements de changement.

- Code : `supabase/functions/discovery-mcp-registry/index.ts` (Edge Function Deno)
- SQL : `supabase/migrations/0004_bot_mcp_registry.sql` (+ `0005_cron_intendex.sql` pour le cron toutes les 15 min)
- Installation en une fois : `supabase/INSTALL_ROBOT_1.sql`
- 1er passage : crawl complet (~30k serveurs) réparti sur plusieurs exécutions, reprise automatique au bon endroit.
  Ensuite : seulement les serveurs modifiés depuis le dernier crawl complet.
- Suivi : `select * from v_bot_runs limit 20;`
- Test local : `DB=t_bot node --experimental-strip-types tests/bot_mcp_registry.test.mts` (après installation de la base de test)
