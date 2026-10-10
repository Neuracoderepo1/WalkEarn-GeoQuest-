#!/usr/bin/env bash
# Runs both migrations and the scenario suite against a throwaway database.
# Needs Postgres 15+ with PostGIS and pgcrypto available. Set DATABASE_URL to an empty, disposable database.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Set DATABASE_URL to a disposable Postgres database with PostGIS available}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f tests/db/harness.sql
for f in supabase/migrations/*.sql; do echo "apply $f"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f tests/db/scenarios.sql
echo "DB scenarios passed"
