import { describe, expect, it } from "vitest";
import { getMissingSyncScopes, parseShopifyScopes } from "./scopes";

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
