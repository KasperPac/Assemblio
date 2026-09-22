import { describe, expect, it } from "vitest";
import { getMissingSyncScopes, parseShopifyScopes, OAUTH_SCOPES } from "./scopes";

describe("shopify scopes helpers", () => {
  it("parses comma-delimited scopes with whitespace", () => {
    expect(
      parseShopifyScopes("read_products, read_orders ,read_inventory")
    ).toEqual(new Set(["read_products", "read_orders", "read_inventory"]));
  });

  it("returns missing required sync scopes", () => {
    expect(getMissingSyncScopes("read_products")).toEqual(["read_orders"]);
    expect(getMissingSyncScopes("read_products,read_orders")).toEqual([]);
    expect(getMissingSyncScopes("")).toEqual(["read_products", "read_orders"]);
  });
});

describe("requested OAuth scopes", () => {
  it("asks for exactly the two scopes the sync uses — no protected customer data", () => {
    const requested = parseShopifyScopes(OAUTH_SCOPES);
    expect([...requested].sort()).toEqual(["read_orders", "read_products"]);
    expect(requested.has("read_customers")).toBe(false);
  });

  it("leaves nothing missing when a store grants exactly what we ask for", () => {
    expect(getMissingSyncScopes(OAUTH_SCOPES)).toEqual([]);
  });
});
