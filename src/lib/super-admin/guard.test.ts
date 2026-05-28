import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireSuperAdmin, requirePlatformOperator } from "./guard";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";

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

  it("passes for super_admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("super_admin"));
    await expect(requireSuperAdmin()).resolves.not.toThrow();
  });

  it("throws for platform_observer", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("platform_observer"));
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

  it("passes for super_admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("super_admin"));
    await expect(requirePlatformOperator()).resolves.not.toThrow();
  });

  it("passes for platform_observer", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx("platform_observer"));
    await expect(requirePlatformOperator()).resolves.not.toThrow();
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
