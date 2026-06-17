import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the tenant context module before importing the SUT.
vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { logActivity, logSystemActivity } from "./log";

type Row = Record<string, unknown>;

function fakeClient(opts: { insertError?: unknown; profileName?: string | null; throwOnInsert?: boolean } = {}) {
  const inserted: Row[] = [];
  const client = {
    inserted,
    auth: { getUser: async () => ({ data: { user: { email: "fallback@x.com" } } }) },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { full_name: opts.profileName ?? null }, error: null }),
          }),
        }),
        insert: async (row: Row) => {
          if (opts.throwOnInsert) throw new Error("boom");
          inserted.push({ table, ...row });
          return { data: null, error: opts.insertError ?? null };
        },
      };
    },
  };
  return client;
}

beforeEach(() => vi.clearAllMocks());

describe("logActivity", () => {
  it("inserts a row with resolved user actor + snapshotted full_name", async () => {
    const client = fakeClient({ profileName: "Kasper" });
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: client, tenantId: "t1", userId: "u1", role: "admin", superAdminHomeTenantId: null,
    });
    await logActivity({ event: "component.created", entityId: "c1", metadata: { name: "R" } });
    const row = client.inserted.find((r) => r.table === "activity_log")!;
    expect(row).toMatchObject({
      tenant_id: "t1", actor_id: "u1", actor_type: "user",
      actor_label: "Kasper", event: "component.created", entity_id: "c1", summary: "Created component R",
    });
  });

  it("falls back to email when full_name is null", async () => {
    const client = fakeClient({ profileName: null });
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: client, tenantId: "t1", userId: "u1", role: "admin", superAdminHomeTenantId: null,
    });
    await logActivity({ event: "trash.emptied" });
    const row = client.inserted.find((r) => r.table === "activity_log")!;
    expect(row.actor_label).toBe("fallback@x.com");
  });

  it("does nothing when there is no tenant context", async () => {
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(logActivity({ event: "trash.emptied" })).resolves.toBeUndefined();
  });

  it("never throws when the insert throws", async () => {
    const client = fakeClient({ throwOnInsert: true, profileName: "Kasper" });
    (getServerTenantContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      supabase: client, tenantId: "t1", userId: "u1", role: "admin", superAdminHomeTenantId: null,
    });
    await expect(logActivity({ event: "trash.emptied" })).resolves.toBeUndefined();
  });
});

describe("logSystemActivity", () => {
  it("inserts a typed system row with no actor_id", async () => {
    const client = fakeClient();
    await logSystemActivity({
      supabase: client as never, tenantId: "t1", event: "shopify.sync_completed",
      actorType: "shopify", actorLabel: "Shopify sync", metadata: { products: 3 },
    });
    const row = client.inserted.find((r) => r.table === "activity_log")!;
    expect(row).toMatchObject({
      tenant_id: "t1", actor_id: null, actor_type: "shopify", actor_label: "Shopify sync",
      event: "shopify.sync_completed",
    });
  });

  it("never throws when the insert throws", async () => {
    const client = fakeClient({ throwOnInsert: true });
    await expect(
      logSystemActivity({
        supabase: client as never, tenantId: "t1", event: "shopify.sync_completed",
        actorType: "shopify", actorLabel: "Shopify sync",
      })
    ).resolves.toBeUndefined();
  });
});
