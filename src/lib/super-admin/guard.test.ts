import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireSuperAdmin, requirePlatformOperator } from "./guard";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";

// Post-Task 2, platform operators have tenantId: null when no tenant is active.
// Regular roles always have a tenantId.
function makeCtx(role: string) {
  return {
    supabase: {} as any,
    tenantId: role === "super_admin" || role === "platform_observer" ? null : "t-1",
    role,
    userId: "user-1",
    superAdminHomeTenantId: null,
  };
}

describe("requireSuperAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns context for super_admin", async () => {
    const ctx = makeCtx("super_admin");
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx);
    const result = await requireSuperAdmin();
    expect(result).toBe(ctx);
  });

  it("throws for platform_observer", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("platform_observer"));
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });

  it("throws for admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("admin"));
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });

  it("throws for member", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("member"));
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });

  it("throws when unauthenticated", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });
});

describe("requirePlatformOperator", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns context for super_admin", async () => {
    const ctx = makeCtx("super_admin");
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx);
    const result = await requirePlatformOperator();
    expect(result).toBe(ctx);
  });

  it("returns context for platform_observer", async () => {
    const ctx = makeCtx("platform_observer");
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx);
    const result = await requirePlatformOperator();
    expect(result).toBe(ctx);
  });

  it("throws for admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("admin"));
    await expect(requirePlatformOperator()).rejects.toThrow("forbidden");
  });

  it("throws for member", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("member"));
    await expect(requirePlatformOperator()).rejects.toThrow("forbidden");
  });

  it("throws when unauthenticated", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    await expect(requirePlatformOperator()).rejects.toThrow("forbidden");
  });
});
