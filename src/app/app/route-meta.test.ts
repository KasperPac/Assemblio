import { describe, expect, it } from "vitest";
import { getActiveNavHref, getDynamicBreadcrumbs, getRouteBand, getRouteMeta } from "./route-meta";

describe("approved app bands", () => {
  it.each([
    ["/app", null], ["/app/inventory", "inventory"], ["/app/components", "inventory"],
    ["/app/stocktake", "inventory"], ["/app/planning/floor", "production"],
    ["/app/purchasing", "purchasing"], ["/app/products", "products"], ["/app/templates", "products"],
    ["/app/goods-inwards", "logistics"], ["/app/suppliers", "logistics"],
    ["/app/warehouse/locations", "logistics"], ["/app/reports", "audit"],
    ["/app/activity-log", "audit"], ["/app/super-admin/audit", "audit"],
    ["/app/orders", null], ["/app/trash", null], ["/app/super-admin", null], ["/app/super-admin/team", null],
  ])("maps %s to %s", (path, domain) => {
    expect(getRouteBand(path)?.domain).toBe(domain);
  });

  it("reserves the cover variant for Reports", () => {
    expect(getRouteBand("/app/reports")).toEqual({ domain: "audit", cover: true });
    expect(getRouteBand("/app/activity-log")).toEqual({ domain: "audit" });
  });

  it.each(["/app/purchasing/po-123", "/app/products/variants/123", "/app/planning/shopfloor", "/app/planning/upgrade", "/app/settings", "/app/orders/new", "/app/super-admin/team/123", "/app/reports/print", "/app/inventory-extra", "/app/", null, undefined])(
    "keeps %s quiet", (path) => expect(getRouteBand(path)).toBeNull(),
  );
});

describe("navigation route selection", () => {
  const links = ["/app", "/app/products", "/app/super-admin", "/app/super-admin/audit", "/app/super-admin/team"];
  it("selects only Audit instead of its Tenants parent", () => {
    expect(getActiveNavHref("/app/super-admin/audit", links)).toBe("/app/super-admin/audit");
    expect(getActiveNavHref("/app/super-admin/audit/event", links)).toBe("/app/super-admin/audit");
  });
  it("does not activate Dashboard or Products for a prefix collision", () => {
    expect(getActiveNavHref("/app/products-extra", links)).toBeNull();
    expect(getActiveNavHref("/app/settings", links)).toBeNull();
    expect(getActiveNavHref("/app/products/123", links)).toBe("/app/products");
  });
  it("uses specific route metadata and preserves detail breadcrumbs", () => {
    expect(getRouteMeta("/app/super-admin/audit").title).toBe("Audit log");
    expect(getRouteMeta("/app/products/variants/123").title).toBe("Variant Detail");
    expect(getRouteMeta("/app/products-extra").title).toBe("Overview");
    expect(getDynamicBreadcrumbs("/app/products/variants/123")).toEqual([{ label: "Products", href: "/app/products" }]);
  });
});
