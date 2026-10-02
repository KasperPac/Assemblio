import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenant/context", () => ({ getServerTenantContext: vi.fn() }));

import { isAdminRole, isReadOnlyRole } from "./authz";

describe("isReadOnlyRole", () => {
  it("is true only for platform_observer", () => {
    expect(isReadOnlyRole("platform_observer")).toBe(true);
    for (const r of ["admin", "super_admin", "member", "", null, undefined]) expect(isReadOnlyRole(r)).toBe(false);
  });
  it("is never an admin role", () => {
    expect(isAdminRole("platform_observer")).toBe(false);
  });
});
