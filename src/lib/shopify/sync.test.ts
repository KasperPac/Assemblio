import { describe, expect, it } from "vitest";
import { buildOrderLineRows } from "./sync";

describe("buildOrderLineRows", () => {
  it("maps discounted unit price to unit_sell_price and line_sell_price", () => {
    const variantMap = new Map([["gid://shopify/ProductVariant/1", "local-v1"]]);
    const lineItems = [
      {
        quantity: 3,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: { shopMoney: { amount: "50.00" } },
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows).toEqual([
      {
        tenant_id: "tenant-id",
        order_id: "order-id",
        variant_id: "local-v1",
        quantity: 3,
        unit_sell_price: 50,
        line_sell_price: 150,
      },
    ]);
  });

  it("collapses duplicate variants — sums quantity, keeps first price", () => {
    const variantMap = new Map([["gid://shopify/ProductVariant/1", "local-v1"]]);
    const lineItems = [
      {
        quantity: 2,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: { shopMoney: { amount: "40.00" } },
      },
      {
        quantity: 1,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: { shopMoney: { amount: "40.00" } },
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].unit_sell_price).toBe(40);
    expect(rows[0].line_sell_price).toBe(120);
  });

  it("defaults to 0 when discountedUnitPriceSet is null", () => {
    const variantMap = new Map([["gid://shopify/ProductVariant/1", "local-v1"]]);
    const lineItems = [
      {
        quantity: 1,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: null,
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows[0].unit_sell_price).toBe(0);
    expect(rows[0].line_sell_price).toBe(0);
  });

  it("skips line items whose variant is not in variantMap", () => {
    const variantMap = new Map<string, string>();
    const lineItems = [
      {
        quantity: 5,
        variant: { id: "gid://shopify/ProductVariant/999" },
        discountedUnitPriceSet: { shopMoney: { amount: "10.00" } },
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows).toHaveLength(0);
  });
});
