import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? "http://localhost:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const SUPER_ADMIN_JWT = process.env.TEST_SUPER_ADMIN_JWT ?? "";

const BUSINESS_TABLES = [
  // Block 3a — original 22 + extras from later feature migrations
  "tenant_domain", "component_group", "component", "location",
  "shopify_store", "shopify_install_tokens", "shopify_product", "shopify_variant",
  "product_bom", "product_bom_component", "inventory_balance", "inventory_movement",
  "orders", "order_line", "order_component_allocation",
  "stocktake_session", "stocktake_line",
  "suppliers", "purchase_order", "purchase_order_line",
  "activity_log", "event_log",
  "department", "staff_member", "staff_availability_week", "cost_rate_schedule",
  "product_bom_labor", "job_cost_snapshot", "job_labor_plan", "job_actual_time_entry",
  "job_cost_actual_rollup", "department_capacity_week", "department_utilization_week",
  "bin_sub_location", "bin_aisle", "bin_bay",
  "bom_template", "bom_template_line",
  // Block 3b
  "job_routing_step", "product_notification_trigger", "notification_log",
  // Block 3c
  "stocktake_variance_reason",
  // Block 3d
  "delivery_receipt", "delivery_receipt_line", "supplier_contacts",
  "supplier_components", "supplier_component_price_breaks", "order_source_sla",
  // Block 3e
  "tenant_dashboard_config", "tenant_invoices",
] as const;

describe("RLS — business tables", () => {
  it.skipIf(!SUPER_ADMIN_JWT || !ANON_KEY)(
    "super_admin with no active tenant reads zero rows from all business tables",
    async () => {
      const client = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${SUPER_ADMIN_JWT}` } },
      });

      for (const table of BUSINESS_TABLES) {
        const { data, error } = await client.from(table).select("*").limit(10);
        expect(error, `unexpected error on table ${table}: ${error?.message}`).toBeNull();
        expect(data ?? [], `table ${table} should return 0 rows for tenant-less super_admin`).toHaveLength(0);
      }
    }
  );

  it.skipIf(!SERVICE_ROLE_KEY)(
    "no business-table policy references is_super_admin",
    async () => {
      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      // Query pg_policies directly via PostgREST — service-role clients can access system views
      const { data, error } = await adminClient
        .from("pg_policies")
        .select("tablename, policyname, qual, with_check")
        .in("tablename", [...BUSINESS_TABLES]);

      expect(error, `pg_policies query failed: ${error?.message}`).toBeNull();

      for (const policy of (data ?? []) as Array<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>) {
        expect(
          policy.qual ?? "",
          `Policy "${policy.policyname}" on "${policy.tablename}" still references is_super_admin in qual`
        ).not.toContain("is_super_admin");
        expect(
          policy.with_check ?? "",
          `Policy "${policy.policyname}" on "${policy.tablename}" still references is_super_admin in with_check`
        ).not.toContain("is_super_admin");
      }
    }
  );
});
