import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? "http://localhost:54321";
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const OBSERVER_JWT = process.env.TEST_OBSERVER_JWT ?? "";
const MEMBER_JWT = process.env.TEST_MEMBER_JWT ?? "";

const PLATFORM_TABLES = [
  "tenant",
  "tenant_subscription",
  "profile_tenant_access",
  "super_admin_audit_log",
] as const;

describe("RLS — platform tables (observer)", () => {
  it("platform_observer can SELECT from all platform tables without error", async () => {
    if (!OBSERVER_JWT || !ANON_KEY) {
      console.warn("TEST_OBSERVER_JWT or SUPABASE_TEST_ANON_KEY not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${OBSERVER_JWT}` } },
    });
    for (const table of PLATFORM_TABLES) {
      const { error } = await client.from(table).select("*").limit(1);
      expect(error, `observer should be able to SELECT from ${table}: ${error?.message}`).toBeNull();
    }
  });

  it("platform_observer cannot INSERT into tenant table (write policies blocked)", async () => {
    if (!OBSERVER_JWT || !ANON_KEY) {
      console.warn("TEST_OBSERVER_JWT or SUPABASE_TEST_ANON_KEY not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${OBSERVER_JWT}` } },
    });
    const { error } = await client.from("tenant").insert({ name: "rls-test-should-fail" });
    expect(error, "observer INSERT into tenant should be blocked by RLS").not.toBeNull();
  });

  it("platform_observer cannot UPDATE tenant table", async () => {
    if (!OBSERVER_JWT || !ANON_KEY) {
      console.warn("TEST_OBSERVER_JWT or SUPABASE_TEST_ANON_KEY not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${OBSERVER_JWT}` } },
    });
    const { error } = await client
      .from("tenant")
      .update({ name: "rls-test-tamper" })
      .eq("id", "00000000-0000-0000-0000-000000000000");
    expect(error, "observer UPDATE on tenant should be blocked by RLS").not.toBeNull();
  });

  it("platform_observer cannot DELETE from tenant table", async () => {
    if (!OBSERVER_JWT || !ANON_KEY) {
      console.warn("TEST_OBSERVER_JWT or SUPABASE_TEST_ANON_KEY not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${OBSERVER_JWT}` } },
    });
    const { error } = await client
      .from("tenant")
      .delete()
      .eq("id", "00000000-0000-0000-0000-000000000000");
    expect(error, "observer DELETE on tenant should be blocked by RLS").not.toBeNull();
  });

  it("member cannot SELECT from super_admin_audit_log", async () => {
    if (!MEMBER_JWT || !ANON_KEY) {
      console.warn("TEST_MEMBER_JWT or SUPABASE_TEST_ANON_KEY not set — skipping");
      return;
    }
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${MEMBER_JWT}` } },
    });
    const { data, error } = await client.from("super_admin_audit_log").select("*").limit(1);
    // RLS returns empty set, not an error, for blocked SELECT
    expect(error, "member SELECT on audit_log should not error (RLS returns empty)").toBeNull();
    expect(data ?? [], "member should see zero audit log rows").toHaveLength(0);
  });
});
