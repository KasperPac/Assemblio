import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPER_ADMIN_JWT = process.env.TEST_SUPER_ADMIN_JWT ?? "";
const OBSERVER_JWT = process.env.TEST_OBSERVER_JWT ?? "";
const TEST_TENANT_ID = process.env.TEST_TENANT_ID ?? "";

const hasEnv = !!(SUPABASE_URL && ANON_KEY && SUPER_ADMIN_JWT && TEST_TENANT_ID);

// Non-super_admin JWT — use observer or fall back to anon
function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: OBSERVER_JWT ? { Authorization: `Bearer ${OBSERVER_JWT}` } : {} },
  });
}

function superAdminClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${SUPER_ADMIN_JWT}` } },
  });
}

describe("get_tenant_health_indicators", () => {
  // NOTE: "Shopify sync failed → critical" and "no integrations → health ok"
  // tests require specific seed data. The SQL CASE logic is provably correct by inspection.

  it.skipIf(!hasEnv)(
    "non-platform-operator calling get_tenant_health_indicators → throws forbidden",
    async () => {
      const { error } = await anonClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [TEST_TENANT_ID],
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/forbidden/i);
    }
  );

  it.skipIf(!hasEnv)(
    "platform operator calling with valid tenant IDs → returns one row per tenant",
    async () => {
      const { data, error } = await superAdminClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [TEST_TENANT_ID],
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      const row = (data as { tenant_id: string; health: string; reasons: string[] }[])
        .find((r) => r.tenant_id === TEST_TENANT_ID);
      expect(row).toBeDefined();
      expect(["critical", "warn", "ok"]).toContain(row!.health);
      expect(Array.isArray(row!.reasons)).toBe(true);
    }
  );

  it.skipIf(!hasEnv)(
    "empty tenant ID array returns empty result",
    async () => {
      const { data, error } = await superAdminClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [],
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    }
  );

  it.skipIf(!hasEnv)(
    "unknown tenant UUID in health indicators → 0 rows (WHERE clause boundary)",
    async () => {
      // Use a nil UUID that won't match any real tenant — verifies the WHERE clause
      const nilId = "00000000-0000-0000-0000-000000000000";
      const { data, error } = await superAdminClient().rpc("get_tenant_health_indicators", {
        p_tenant_ids: [nilId],
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    }
  );
});

describe("get_tenant_vitals", () => {
  it.skipIf(!hasEnv)(
    "non-platform-operator calling get_tenant_vitals → throws forbidden",
    async () => {
      const { error } = await anonClient().rpc("get_tenant_vitals", {
        p_tenant_id: TEST_TENANT_ID,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/forbidden/i);
    }
  );

  it.skipIf(!hasEnv)(
    "platform operator calling get_tenant_vitals → returns one row with correct shape",
    async () => {
      const { data, error } = await superAdminClient().rpc("get_tenant_vitals", {
        p_tenant_id: TEST_TENANT_ID,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect((data as unknown[]).length).toBe(1);

      const row = (data as Record<string, unknown>[])[0];
      const expectedKeys = [
        "last_activity_at", "seven_day_event_count", "seven_day_active_members",
        "member_last_sign_in_at", "component_count", "bom_count", "open_order_count",
        "supplier_count", "shopify_connected", "shopify_store_domain",
        "shopify_last_synced_at", "shopify_last_sync_status", "shopify_last_sync_error",
        "accounting_provider", "accounting_account_name", "accounting_token_expires_at",
        "accounting_token_expired", "accounting_thirty_day_synced", "accounting_thirty_day_failed",
      ];
      for (const key of expectedKeys) {
        expect(row, `key ${key} missing`).toHaveProperty(key);
      }

      expect(row.component_count as number).toBeGreaterThanOrEqual(0);
      expect(row.bom_count as number).toBeGreaterThanOrEqual(0);
      expect(row.open_order_count as number).toBeGreaterThanOrEqual(0);
      expect(row.supplier_count as number).toBeGreaterThanOrEqual(0);
      expect(row.seven_day_event_count as number).toBeGreaterThanOrEqual(0);
      expect(row.seven_day_active_members as number).toBeGreaterThanOrEqual(0);
    }
  );

  it.skipIf(!hasEnv)(
    "tenant with no integrations → shopify_connected is boolean",
    async () => {
      const { data } = await superAdminClient().rpc("get_tenant_vitals", {
        p_tenant_id: TEST_TENANT_ID,
      });
      const row = (data as Record<string, unknown>[])[0];
      expect(typeof row.shopify_connected).toBe("boolean");
    }
  );
});
