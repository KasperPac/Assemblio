#!/usr/bin/env bash
# Probes which public SECURITY DEFINER RPCs an UNAUTHENTICATED caller can reach.
#
# The anon key is public by design (it ships in the client bundle), so this is
# exactly what an outsider can do. Run it after any migration that adds a
# SECURITY DEFINER function: CREATE FUNCTION grants EXECUTE to PUBLIC by
# default and anon inherits PUBLIC, so new functions are exposed unless the
# migration revokes it.
#
#   SUPABASE_URL=https://<ref>.supabase.co \
#   SUPABASE_ANON_KEY=<anon key> \
#   ./scripts/probe_anon_rpc_surface.sh
#
# Expected: every line below prints 401 "permission denied", except
# current_tenant_id, which must stay reachable (RLS policies evaluate it as
# the querying role — revoking it turns "no rows" into a hard error).
set -u
: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"

Z="00000000-0000-0000-0000-000000000000"
fail=0

probe() { # name, json body, expectation: deny|allow
  local name="$1" body="$2" expect="$3"
  local code
  code=$(curl -s -o /tmp/probe.json -w '%{http_code}' -X POST \
    "$SUPABASE_URL/rest/v1/rpc/$name" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" -d "$body")
  if [ "$expect" = deny ]; then
    if [ "$code" = 401 ]; then printf 'ok    %-42s denied (401)\n' "$name"
    else printf 'FAIL  %-42s expected 401, got %s\n' "$name" "$code"; fail=1; fi
  else
    if [ "$code" = 200 ]; then printf 'ok    %-42s reachable (200), as required by RLS\n' "$name"
    else printf 'FAIL  %-42s expected 200, got %s\n' "$name" "$code"; fail=1; fi
  fi
}

echo "--- must be denied to anon ---"
probe get_slow_queries                         '{}'                                    deny
probe get_user_emails                          "{\"p_ids\":[\"$Z\"]}"                  deny
probe set_active_tenant                        "{\"p_tenant_id\":\"$Z\"}"              deny
probe receive_delivery_receipt                 "{\"p_delivery_receipt_id\":\"$Z\"}"    deny
probe resolve_location_barcode                 '{"p_code":"x"}'                        deny
probe get_tenant_vitals                        "{\"p_tenant_id\":\"$Z\"}"              deny
probe generate_financial_plans_for_open_orders '{"p_start_week":"2026-09-21"}'         deny
# The write RPCs the 2026-09-02 hardening locked down — kept here so a future
# migration that re-creates them cannot quietly restore the PUBLIC default.
probe apply_inventory_movement                 "{\"p_component_id\":\"$Z\",\"p_location_id\":\"$Z\",\"p_delta_on_hand\":0,\"p_delta_in_prod\":0,\"p_reason\":\"probe\",\"p_reference_type\":\"probe\",\"p_reference_id\":null}" deny
probe apply_reserved_movement                  "{\"p_tenant_id\":\"$Z\",\"p_component_id\":\"$Z\",\"p_location_id\":\"$Z\",\"p_order_id\":null,\"p_delta_reserved\":0}" deny
probe apply_sale_consumption                   "{\"p_tenant_id\":\"$Z\",\"p_order_line_id\":\"$Z\",\"p_location_id\":\"$Z\"}" deny
probe create_retail_item                       "{\"p_tenant_id\":\"$Z\",\"p_variant_id\":null,\"p_name\":\"probe\",\"p_sku\":null,\"p_barcode\":null,\"p_cost_per_unit\":0,\"p_supplier_id\":null,\"p_location_id\":null,\"p_reorder_point\":0}" deny

echo "--- must stay reachable (RLS evaluates these as the querying role) ---"
probe current_tenant_id                        '{}'                                    allow

exit "$fail"
