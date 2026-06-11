import { describe, expect, it } from "vitest";
import { shouldShowDevDashboard } from "./access";

describe("shouldShowDevDashboard", () => {
  it("allows tenant-less platform operators to see the developer dashboard", () => {
    expect(
      shouldShowDevDashboard({
        role: "super_admin",
        tenantId: null,
        superAdminHomeTenantId: null,
      })
    ).toBe(true);

    expect(
      shouldShowDevDashboard({
        role: "platform_observer",
        tenantId: null,
        superAdminHomeTenantId: null,
      })
    ).toBe(true);
  });

  it("allows platform operators on their home tenant", () => {
    expect(
      shouldShowDevDashboard({
        role: "super_admin",
        tenantId: "home-tenant",
        superAdminHomeTenantId: "home-tenant",
      })
    ).toBe(true);
  });

  it("does not replace the tenant dashboard while viewing as a client tenant", () => {
    expect(
      shouldShowDevDashboard({
        role: "super_admin",
        tenantId: "client-tenant",
        superAdminHomeTenantId: "home-tenant",
      })
    ).toBe(false);
  });

  it("does not show the developer dashboard to tenant-scoped users", () => {
    expect(
      shouldShowDevDashboard({
        role: "admin",
        tenantId: "tenant-1",
        superAdminHomeTenantId: null,
      })
    ).toBe(false);
  });
});
