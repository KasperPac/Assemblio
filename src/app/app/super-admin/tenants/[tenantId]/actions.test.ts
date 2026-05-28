import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/super-admin/guard", () => ({ requireSuperAdmin: vi.fn() }));
vi.mock("@/lib/super-admin/audit", () => ({ logSuperAdminAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireSuperAdmin } from "@/lib/super-admin/guard";
import { logSuperAdminAction } from "@/lib/super-admin/audit";
import {
  suspendTenant,
  unsuspendTenant,
  softDeleteTenant,
  restoreTenant,
  extendTrial,
  changePlan,
} from "./actions";

function makeSupabaseWithUpdate(tableExpect: string) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  return {
    from: vi.fn((t: string) => {
      if (t === tableExpect) return { update };
      throw new Error("unexpected table " + t);
    }),
    _update: update,
  } as any;
}

beforeEach(() => {
  vi.mocked(requireSuperAdmin).mockReset();
  vi.mocked(logSuperAdminAction).mockReset();
});

describe("suspendTenant", () => {
  it("forbidden when not super_admin", async () => {
    vi.mocked(requireSuperAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(suspendTenant({ tenantId: "t1", reason: "x" })).rejects.toThrow("forbidden");
  });

  it("sets suspended_at + reason and logs", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await suspendTenant({ tenantId: "t1", reason: "non-payment" });
    expect(sb._update).toHaveBeenCalledWith(expect.objectContaining({ suspended_reason: "non-payment" }));
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "suspend_tenant", targetTenantId: "t1", metadata: { reason: "non-payment" },
    }));
  });
});

describe("unsuspendTenant", () => {
  it("clears suspended_at and reason", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await unsuspendTenant({ tenantId: "t1" });
    expect(sb._update).toHaveBeenCalledWith({ suspended_at: null, suspended_reason: null });
  });
});

describe("softDeleteTenant", () => {
  it("sets deleted_at and logs reason", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await softDeleteTenant({ tenantId: "t1", reason: "churn" });
    expect(sb._update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "soft_delete_tenant", metadata: { reason: "churn" },
    }));
  });
});

describe("restoreTenant", () => {
  it("clears deleted_at", async () => {
    const sb = makeSupabaseWithUpdate("tenant");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await restoreTenant({ tenantId: "t1" });
    expect(sb._update).toHaveBeenCalledWith({ deleted_at: null });
  });
});

describe("extendTrial", () => {
  it("rejects past dates", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: {}, userId: "u1" } as any);
    await expect(
      extendTrial({ tenantId: "t1", newTrialEndsAt: new Date(Date.now() - 86_400_000).toISOString() })
    ).rejects.toThrow(/future/i);
  });

  it("updates trial_ends_at when valid", async () => {
    const sb = makeSupabaseWithUpdate("tenant_subscription");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await extendTrial({ tenantId: "t1", newTrialEndsAt: future, reason: "demo" });
    expect(sb._update).toHaveBeenCalledWith({ trial_ends_at: future });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "extend_trial",
      metadata: { reason: "demo", newTrialEndsAt: future },
    }));
  });
});

describe("changePlan", () => {
  it("updates fields and sets manual_override_at", async () => {
    const sb = makeSupabaseWithUpdate("tenant_subscription");
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await changePlan({ tenantId: "t1", selected_tier: "pro", status: "active", reason: "comp" });
    expect(sb._update).toHaveBeenCalledWith(expect.objectContaining({
      selected_tier: "pro",
      status: "active",
      manual_override_at: expect.any(String),
    }));
  });

  it("requires at least one field", async () => {
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: {}, userId: "u1" } as any);
    await expect(changePlan({ tenantId: "t1" })).rejects.toThrow(/at least one/i);
  });
});

import { addMember, removeMember, changeMemberRole } from "./actions";

describe("addMember", () => {
  it("inserts a profile_tenant_access row and logs", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sb = { from: vi.fn().mockReturnValue({ insert }) } as any;
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await addMember({ tenantId: "t1", profileId: "p1", role: "admin" });
    expect(sb.from).toHaveBeenCalledWith("profile_tenant_access");
    expect(insert).toHaveBeenCalledWith({ profile_id: "p1", tenant_id: "t1", role: "admin" });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "add_member", targetTenantId: "t1", targetUserId: "p1",
    }));
  });
});

describe("removeMember", () => {
  it("deletes the row and logs", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const del = vi.fn().mockReturnValue({ eq: eq1 });
    const sb = { from: vi.fn().mockReturnValue({ delete: del }) } as any;
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await removeMember({ tenantId: "t1", profileId: "p1" });
    expect(del).toHaveBeenCalled();
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "remove_member", targetTenantId: "t1", targetUserId: "p1",
    }));
  });
});

describe("changeMemberRole", () => {
  it("updates the role and logs", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const update = vi.fn().mockReturnValue({ eq: eq1 });
    const sb = { from: vi.fn().mockReturnValue({ update }) } as any;
    vi.mocked(requireSuperAdmin).mockResolvedValue({ supabase: sb, userId: "u1" } as any);
    await changeMemberRole({ tenantId: "t1", profileId: "p1", newRole: "member" });
    expect(update).toHaveBeenCalledWith({ role: "member" });
    expect(logSuperAdminAction).toHaveBeenCalledWith(sb, expect.objectContaining({
      action: "change_role", metadata: { newRole: "member" },
    }));
  });
});
