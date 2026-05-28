import { describe, it, expect, vi, beforeEach } from "vitest";
import { getServerTenantContext } from "./context";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

function makeSupabase({
  userId,
  profile,
  accessRows = [],
}: {
  userId: string | null;
  profile: {
    tenant_id: string | null;
    role: string;
    status?: string;
    super_admin_home_tenant_id?: string | null;
  } | null;
  accessRows?: Array<{ tenant_id: string }>;
}) {
  const fakeSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: profile }),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === "profile_tenant_access") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: accessRows }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null }),
      };
    }),
  };
  return fakeSupabase;
}

describe("getServerTenantContext", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no auth user", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ userId: null, profile: null }) as any
    );
    expect(await getServerTenantContext()).toBeNull();
  });

  it("returns null when profile status is deactivated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-1",
        profile: { tenant_id: "t-1", role: "member", status: "deactivated" },
      }) as any
    );
    expect(await getServerTenantContext()).toBeNull();
  });

  it("returns context with tenantId null for super_admin with null tenant_id", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-sa",
        profile: { tenant_id: null, role: "super_admin", super_admin_home_tenant_id: null },
      }) as any
    );
    const result = await getServerTenantContext();
    expect(result).not.toBeNull();
    expect(result!.tenantId).toBeNull();
    expect(result!.role).toBe("super_admin");
    expect(result!.userId).toBe("user-sa");
  });

  it("returns context with tenantId null for platform_observer with null tenant_id", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-obs",
        profile: { tenant_id: null, role: "platform_observer" },
      }) as any
    );
    const result = await getServerTenantContext();
    expect(result).not.toBeNull();
    expect(result!.tenantId).toBeNull();
    expect(result!.role).toBe("platform_observer");
  });

  it("returns null for member with null tenant_id (invariant violation)", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-m",
        profile: { tenant_id: null, role: "member" },
      }) as any
    );
    expect(await getServerTenantContext()).toBeNull();
  });

  it("returns context with tenantId set for member with valid tenant access", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-m",
        profile: { tenant_id: "t-1", role: "member", status: "active", super_admin_home_tenant_id: null },
        accessRows: [{ tenant_id: "t-1" }],
      }) as any
    );
    const result = await getServerTenantContext();
    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe("t-1");
  });

  it("returns null for member with no tenant access rows", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({
        userId: "user-m",
        profile: { tenant_id: "t-1", role: "member", status: "active" },
        accessRows: [],
      }) as any
    );
    expect(await getServerTenantContext()).toBeNull();
  });
});
