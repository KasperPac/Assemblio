import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/super-admin/guard", () => ({
  requireSuperAdmin: vi.fn(),
  requirePlatformOperator: vi.fn(),
}));
vi.mock("@/lib/super-admin/audit", () => ({ logSuperAdminAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn().mockImplementation((url: string) => { throw new Error("redirect: " + url); }) }));

import { requireSuperAdmin, requirePlatformOperator } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";
import { createTenant, viewAsTenant, exitViewAs } from "./actions";

function makeSupabase(overrides: Record<string, any> = {}) {
  const tenantInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "new-tenant-id" }, error: null }),
    }),
  });
  const subInsert = vi.fn().mockResolvedValue({ error: null });
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const profileUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const from = vi.fn((table: string) => {
    if (table === "tenant") return { insert: tenantInsert };
    if (table === "tenant_subscription") return { insert: subInsert };
    if (table === "super_admin_audit_log") return { insert: auditInsert };
    if (table === "profiles") return { update: profileUpdate };
    if (overrides[table]) return overrides[table];
    throw new Error("unexpected table: " + table);
  });

  return {
    from,
    rpc,
    _tenantInsert: tenantInsert,
    _subInsert: subInsert,
    _auditInsert: auditInsert,
    _rpc: rpc,
    _profileUpdate: profileUpdate,
  } as any;
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

  it("inserts tenant + subscription + logs audit (no auto-member row)", async () => {
    const sb = makeSupabase();
    vi.mocked(requireSuperAdmin).mockResolvedValue({
      supabase: sb, userId: "kasper", role: "super_admin", tenantId: null, superAdminHomeTenantId: null,
    } as any);
    const id = await createTenant({
      name: "Acme", timezone: "UTC", currency: "AUD", tier: "starter", trialDays: 14, reason: "demo",
    });
    expect(id).toBe("new-tenant-id");
    expect(sb._tenantInsert).toHaveBeenCalled();
    expect(sb._subInsert).toHaveBeenCalled();
    // profile_tenant_access NOT inserted
    expect(() => sb.from("profile_tenant_access")).toThrow("unexpected table: profile_tenant_access");
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      actorId: "kasper", action: "create_tenant", targetTenantId: "new-tenant-id",
      metadata: { reason: "demo", name: "Acme", tier: "starter", trialDays: 14 },
    }));
  });
});

describe("viewAsTenant", () => {
  beforeEach(() => {
    vi.mocked(requirePlatformOperator).mockReset();
    vi.mocked(logSuperAdminAction).mockReset();
  });

  it("succeeds for super_admin", async () => {
    const sb = makeSupabase();
    vi.mocked(requirePlatformOperator).mockResolvedValue({
      supabase: sb, userId: "sa-id", role: "super_admin", tenantId: "t-1", superAdminHomeTenantId: "home-t",
    } as any);
    await expect(viewAsTenant("t-1")).rejects.toThrow(); // redirect throws in test env
    expect(sb._rpc).toHaveBeenCalledWith("set_active_tenant", { p_tenant_id: "t-1" });
  });

  it("succeeds for platform_observer", async () => {
    const sb = makeSupabase();
    vi.mocked(requirePlatformOperator).mockResolvedValue({
      supabase: sb, userId: "obs-id", role: "platform_observer", tenantId: null, superAdminHomeTenantId: null,
    } as any);
    await expect(viewAsTenant("t-1")).rejects.toThrow(); // redirect throws in test env
    expect(sb._rpc).toHaveBeenCalledWith("set_active_tenant", { p_tenant_id: "t-1" });
  });
});

describe("exitViewAs", () => {
  beforeEach(() => {
    vi.mocked(requirePlatformOperator).mockReset();
    vi.mocked(logSuperAdminAction).mockReset();
  });

  it("calls set_active_tenant when superAdminHomeTenantId is set", async () => {
    const sb = makeSupabase();
    vi.mocked(requirePlatformOperator).mockResolvedValue({
      supabase: sb, userId: "sa-id", role: "super_admin", tenantId: "t-1", superAdminHomeTenantId: "home-t",
    } as any);
    await expect(exitViewAs()).rejects.toThrow(); // redirect throws in test env
    expect(sb._rpc).toHaveBeenCalledWith("set_active_tenant", { p_tenant_id: "home-t" });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({ action: "exit_view_as" }));
  });

  it("clears profiles.tenant_id when superAdminHomeTenantId is null", async () => {
    const sb = makeSupabase();
    vi.mocked(requirePlatformOperator).mockResolvedValue({
      supabase: sb, userId: "sa-id", role: "super_admin", tenantId: "t-1", superAdminHomeTenantId: null,
    } as any);
    await expect(exitViewAs()).rejects.toThrow(); // redirect throws in test env
    expect(sb._rpc).not.toHaveBeenCalled();
    expect(sb._profileUpdate).toHaveBeenCalledWith({ tenant_id: null });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({ action: "exit_view_as_no_home" }));
  });
});
