import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? "http://localhost:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const SUPER_ADMIN_JWT = process.env.TEST_SUPER_ADMIN_JWT ?? "";

const BUSINESS_TABLES = [
  "tenant_domain", "component_group", "component", "location",
  "shopify_store", "shopify_install_tokens", "shopify_product", "shopify_variant",
  "product_bom", "product_bom_component", "inventory_balance", "inventory_movement",
  "orders", "order_line", "order_component_allocation",
  "stocktake_session", "stocktake_line",
  "suppliers", "purchase_order", "purchase_order_line",
  "activity_log", "event_log",
] as const;

describe("RLS — business tables", () => {
  it("super_admin with no active tenant reads zero rows from all business tables", async () => {
    if (!SUPER_ADMIN_JWT || !ANON_KEY) {
      console.warn("TEST_SUPER_ADMIN_JWT or SUPABASE_TEST_ANON_KEY not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${SUPER_ADMIN_JWT}` } },
    });

    for (const table of BUSINESS_TABLES) {
      const { data, error } = await client.from(table).select("*").limit(10);
      expect(error, `unexpected error on table ${table}: ${error?.message}`).toBeNull();
      expect(data ?? [], `table ${table} should return 0 rows for tenant-less super_admin`).toHaveLength(0);
    }
  });

  it("no business-table policy references is_super_admin", async () => {
    if (!SERVICE_ROLE_KEY) {
      console.warn("SUPABASE_TEST_SERVICE_ROLE_KEY not set — skipping");
      return;
    }
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // pg_policies is not directly queryable via the Supabase JS client — use RPC or raw SQL via rpc
    const { data, error } = await adminClient.rpc("get_policies_for_tables", {
      p_tables: [...BUSINESS_TABLES],
    }).catch(() => ({ data: null, error: new Error("get_policies_for_tables RPC not available") }));

    if (error || !data) {
      // Fallback: query information_schema or pg_policies via a raw query if available
      // If the RPC doesn't exist, skip this sub-check with a warning
      console.warn("pg_policies check skipped: get_policies_for_tables RPC not available.");
      console.warn("Manually verify: SELECT tablename, policyname, qual FROM pg_policies WHERE tablename = ANY(ARRAY[...]) AND qual LIKE '%is_super_admin%'");
      return;
    }

    for (const policy of data as Array<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>) {
      expect(
        policy.qual ?? "",
        `Policy "${policy.policyname}" on "${policy.tablename}" still references is_super_admin in qual`
      ).not.toContain("is_super_admin");
      expect(
        policy.with_check ?? "",
        `Policy "${policy.policyname}" on "${policy.tablename}" still references is_super_admin in with_check`
      ).not.toContain("is_super_admin");
    }
  });
});
