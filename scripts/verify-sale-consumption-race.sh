#!/usr/bin/env bash
# scripts/verify-sale-consumption-race.sh — SCRATCH ONLY.
# Session A consumes the line inside a transaction held open for 2s;
# session B fires 0.5s later and must block on the order_line_consumption
# key, then return 0. Exactly one 'sale' movement may exist afterwards.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMP:-/tmp}"
bash "$ROOT/scripts/scratch-db.sh" up
bash "$ROOT/scripts/scratch-db.sh" sql "$ROOT/supabase/__tests__/2026-09-25-retail-stock-foundation.verify.sql" >/dev/null

setup=$(cat <<'SQL'
set test.service_role = 'on';
insert into public.orders (id, tenant_id, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000a9','11111111-1111-1111-1111-111111111111','fulfilled');
insert into public.order_line (id, tenant_id, order_id, variant_id, quantity) values
  ('aaaaaaaa-0000-0000-0000-00000000ad09','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-0000000000a9','aaaaaaaa-0000-0000-0000-0000000000f1',1);
SQL
)
echo "$setup" | docker exec -i manuva-scratch psql -q -U postgres -v ON_ERROR_STOP=1

call="select public.apply_sale_consumption('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000ad09','aaaaaaaa-0000-0000-0000-0000000000d1');"
( printf "set test.service_role='on'; begin; %s select pg_sleep(2); commit;\n" "$call" \
    | docker exec -i manuva-scratch psql -q -U postgres -At ) > "$TMP/race-a.txt" &
sleep 0.5
printf "set test.service_role='on'; %s\n" "$call" \
  | docker exec -i manuva-scratch psql -q -U postgres -At > "$TMP/race-b.txt"
wait

movements=$(echo "select count(*) from public.inventory_movement where reason='sale' and reference_id='aaaaaaaa-0000-0000-0000-0000000000a9';" \
  | docker exec -i manuva-scratch psql -q -U postgres -At)
echo "A returned: $(head -1 "$TMP/race-a.txt")  B returned: $(head -1 "$TMP/race-b.txt")  movements: $movements"
[ "$movements" = "1" ] && grep -qx 0 "$TMP/race-b.txt" && echo "PASS: race" || { echo "FAIL: race"; exit 1; }
