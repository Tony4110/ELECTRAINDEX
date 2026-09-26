#!/usr/bin/env bash
# Rebuild a throw-away local database and run the engine tests.
# Usage: PGHOST=/tmp PGPORT=5433 PGUSER=postgres scripts/local_test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-intendex_test}
dropdb --if-exists "$DB" && createdb "$DB"
export PGOPTIONS="-c client_min_messages=warning"
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/00_local_supabase_roles.sql
for f in supabase/migrations/*.sql supabase/seed/*.sql; do echo "-> $f"; $P -f "$f"; done
# migrations are idempotent: run them twice
for f in supabase/migrations/*.sql; do $P -f "$f" >/dev/null; done
$P -c "select type, count(*) from entities group by type order by type;" -c "select count(*) as sources, count(*) filter (where is_active) as active from sources;"
psql -v ON_ERROR_STOP=1 -d "$DB" -f tests/test_engine.sql
