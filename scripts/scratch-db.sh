#!/usr/bin/env bash
# scripts/scratch-db.sh — throwaway Postgres for supabase/__tests__/*.verify.sql
# SCRATCH ONLY. Never point this at production.
set -euo pipefail
NAME=manuva-scratch
PORT=55432
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Loaded in order after schema.sql. schema.sql lags production; these bring
# the tables this feature touches up to date. Append, never reorder.
PATCHES=(
  inventory_movement_delta_reserved.sql
  product_bom_unique_active.sql
  apply_reserved_movement_rpc.sql
  2026-09-02-tenant-isolation-hardening.sql
  2026-09-25-retail-stock-foundation.sql
)

run_sql() { docker exec -i "$NAME" psql -q -U postgres -d postgres -v ON_ERROR_STOP=1 < "$1"; }

case "${1:-}" in
  up)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=scratch -p "$PORT:5432" postgres:15 >/dev/null
    until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
    run_sql "$ROOT/supabase/__tests__/scratch-prelude.sql"
    run_sql "$ROOT/supabase/schema.sql"
    for p in "${PATCHES[@]}"; do run_sql "$ROOT/supabase/patches/$p"; done
    echo "scratch db up on :$PORT"
    ;;
  sql) run_sql "$2" ;;
  down) docker rm -f "$NAME" >/dev/null ;;
  *) echo "usage: $0 up|sql <file>|down" >&2; exit 2 ;;
esac
