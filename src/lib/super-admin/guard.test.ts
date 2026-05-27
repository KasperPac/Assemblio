import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { requireSuperAdmin } from "./guard";

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    vi.mocked(getServerTenantContext).mockReset();
  });

  it("returns the context when role is super_admin", async () => {
    const ctx = { role: "super_admin", userId: "u1", tenantId: "t1", supabase: {} as any, superAdminHomeTenantId: "t1" };
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await expect(requireSuperAdmin()).resolves.toBe(ctx);
  });

  it("throws when no context", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });

  it("throws when role is admin", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue({ role: "admin" } as any);
    await expect(requireSuperAdmin()).rejects.toThrow("forbidden");
  });
});
