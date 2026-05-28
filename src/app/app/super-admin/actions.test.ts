import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/super-admin/guard", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/super-admin/audit", () => ({ logSuperAdminAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";
import { createTenant } from "./actions";

function makeSupabase() {
  const tenantInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "new-tenant-id" }, error: null }),
    }),
  });
  const subInsert = vi.fn().mockResolvedValue({ error: null });
  const ptaInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "tenant") return { insert: tenantInsert };
    if (table === "tenant_subscription") return { insert: subInsert };
    if (table === "profile_tenant_access") return { insert: ptaInsert };
    throw new Error("unexpected table " + table);
  });

  return { from, _tenantInsert: tenantInsert, _subInsert: subInsert, _ptaInsert: ptaInsert } as any;
}

describe("createTenant", () => {
  beforeEach(() => {
    vi.mocked(requireSuperAdmin).mockReset();
    vi.mocked(logSuperAdminAction).mockReset();
  });

  it("forbidden when not super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(
      createTenant({ name: "Acme", timezone: "UTC", currency: "AUD", tier: "starter", trialDays: 14 })
    ).rejects.toThrow("forbidden");
  });

  it("inserts tenant + subscription + member access + logs audit", async () => {
    const sb = makeSupabase();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      supabase: sb, userId: "kasper", role: "super_admin", tenantId: "home", superAdminHomeTenantId: "home",
    } as any);
    const id = await createTenant({
      name: "Acme", timezone: "UTC", currency: "AUD", tier: "starter", trialDays: 14, reason: "demo",
    });
    expect(id).toBe("new-tenant-id");
    expect(sb._tenantInsert).toHaveBeenCalled();
    expect(sb._subInsert).toHaveBeenCalled();
    expect(sb._ptaInsert).toHaveBeenCalledWith({
      profile_id: "kasper", tenant_id: "new-tenant-id", role: "admin",
    });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      actorId: "kasper", action: "create_tenant", targetTenantId: "new-tenant-id",
      metadata: { reason: "demo", name: "Acme", tier: "starter", trialDays: 14 },
    }));
  });
});
