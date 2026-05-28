import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/super-admin/guard", () => ({
  requireSuperAdmin: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { addPlatformUser, changePlatformUserRole, removePlatformUser } from "./actions";

function makeCtx(overrides: Partial<{ role: string; userId: string; tenantId: string | null }> = {}) {
  const userId = overrides.userId ?? "actor-id";
  const auditInsert = vi.fn().mockResolvedValue({ error: null });

  const supabase = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "platform_observer", tenant_id: "t-1" } }),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === "super_admin_audit_log") {
        return { insert: auditInsert };
      }
      return {};
    },
    rpc: vi.fn().mockResolvedValue({ data: "found-profile-id", error: null }),
    _auditInsert: auditInsert,
  };

  return {
    supabase: supabase as any,
    userId,
    role: overrides.role ?? "super_admin",
    tenantId: overrides.tenantId ?? null,
    superAdminHomeTenantId: null,
    _auditInsert: auditInsert,
  };
}

describe("addPlatformUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws forbidden for non-super_admin (guard enforces this)", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(addPlatformUser({ email: "x@x.com", role: "platform_observer" }))
      .rejects.toThrow("forbidden");
  });

  it("throws when email not found", async () => {
    const ctx = makeCtx();
    ctx.supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await expect(addPlatformUser({ email: "notfound@x.com", role: "platform_observer" }))
      .rejects.toThrow("No account found");
  });

  it("updates profile role and writes audit log on happy path", async () => {
    const ctx = makeCtx();
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") return { update: updateSpy, eq: eqSpy };
      if (table === "super_admin_audit_log") return { insert: ctx._auditInsert };
      return {};
    });
    ctx.supabase.rpc = vi.fn().mockResolvedValue({ data: "found-id", error: null });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await addPlatformUser({ email: "target@example.com", role: "platform_observer" });
    expect(updateSpy).toHaveBeenCalledWith({ role: "platform_observer", super_admin_home_tenant_id: null });
    expect(ctx._auditInsert).toHaveBeenCalled();
  });
});

describe("changePlatformUserRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws forbidden for non-super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(changePlatformUserRole({ profileId: "x", newRole: "platform_observer" }))
      .rejects.toThrow("forbidden");
  });

  it("throws when demoting the last super_admin", async () => {
    const ctx = makeCtx();
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        let callCount = 0;
        return {
          select: vi.fn().mockImplementation(() => {
            callCount++;
            return {
              eq: vi.fn().mockImplementation(() => ({
                single: vi.fn().mockResolvedValue({ data: { role: "super_admin" } }),
                // for count query
                then: undefined,
              })),
              // count result when called with { count: "exact", head: true }
              then: undefined,
            };
          }),
          // simulate count = 1
          count: vi.fn().mockResolvedValue({ count: 1, error: null }),
        };
      }
      return {};
    });
    // Override to return count: 1 for super_admin
    ctx.supabase.from = vi.fn((table: string) => {
      if (table !== "profiles") return {};
      return {
        select: vi.fn((col?: string, opts?: any) => {
          if (opts?.count === "exact") {
            return { eq: vi.fn().mockResolvedValue({ count: 1, error: null }) };
          }
          return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { role: "super_admin" } }) }) };
        }),
      };
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await expect(
      changePlatformUserRole({ profileId: "only-super", newRole: "platform_observer" })
    ).rejects.toThrow("cannot remove last super_admin");
  });

  it("succeeds and writes audit log when two super_admins exist", async () => {
    const ctx = makeCtx();
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((col?: string, opts?: any) => {
            if (opts?.count === "exact") {
              return { eq: vi.fn().mockResolvedValue({ count: 2, error: null }) };
            }
            return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { role: "super_admin" } }) }) };
          }),
          update: updateSpy,
          eq: eqSpy,
        };
      }
      if (table === "super_admin_audit_log") return { insert: ctx._auditInsert };
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await changePlatformUserRole({ profileId: "target-id", newRole: "platform_observer" });
    expect(ctx._auditInsert).toHaveBeenCalled();
  });

  it("succeeds promoting observer to super_admin (no last-super check needed)", async () => {
    const ctx = makeCtx();
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((col?: string, opts?: any) => {
            if (opts?.count === "exact") {
              return { eq: vi.fn().mockResolvedValue({ count: 3, error: null }) };
            }
            return { eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { role: "platform_observer" } }) }) };
          }),
          update: updateSpy,
          eq: eqSpy,
        };
      }
      if (table === "super_admin_audit_log") return { insert: ctx._auditInsert };
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await changePlatformUserRole({ profileId: "observer-id", newRole: "super_admin" });
    expect(updateSpy).toHaveBeenCalledWith({ role: "super_admin" });
    expect(ctx._auditInsert).toHaveBeenCalled();
  });
});

describe("removePlatformUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws forbidden for non-super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(removePlatformUser({ profileId: "x" })).rejects.toThrow("forbidden");
  });

  it("throws when target has null tenant_id", async () => {
    const ctx = makeCtx();
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: "platform_observer", tenant_id: null } }),
        };
      }
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await expect(removePlatformUser({ profileId: "target-id" }))
      .rejects.toThrow("set a tenant first");
  });

  it("throws when removing the last super_admin", async () => {
    const ctx = makeCtx();
    let selectCallCount = 0;
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((col?: string, opts?: any) => {
            if (opts?.count === "exact") {
              return { eq: vi.fn().mockResolvedValue({ count: 1, error: null }) };
            }
            selectCallCount++;
            return {
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { role: "super_admin", tenant_id: "t-1" } }),
            };
          }),
        };
      }
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await expect(removePlatformUser({ profileId: "only-super" }))
      .rejects.toThrow("cannot remove last super_admin");
  });

  it("sets role to member and clears super_admin_home_tenant_id on happy path", async () => {
    const ctx = makeCtx();
    const updateSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    ctx.supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn((col?: string, opts?: any) => {
            if (opts?.count === "exact") {
              return { eq: vi.fn().mockResolvedValue({ count: 2, error: null }) };
            }
            return {
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { role: "platform_observer", tenant_id: "t-1" } }),
            };
          }),
          update: updateSpy,
          eq: eqSpy,
        };
      }
      if (table === "super_admin_audit_log") return { insert: ctx._auditInsert };
      return {};
    });
    vi.mocked(requireSuperAdmin).mockResolvedValue(ctx);
    await removePlatformUser({ profileId: "target-id" });
    expect(updateSpy).toHaveBeenCalledWith({ role: "member", super_admin_home_tenant_id: null });
    expect(ctx._auditInsert).toHaveBeenCalled();
  });
});
