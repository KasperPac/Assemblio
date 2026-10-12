import { describe, expect, it } from "vitest";
import { squareOrderInput } from "./orders";

describe("Square order ingestion input", () => {
  it("ignores incomplete sales", () => expect(squareOrderInput({ id: "order", location_id: "salon", state: "OPEN" })).toBeNull());
  it("retains unknown stock lines and excludes buyer information", () => {
    const order = { id: "order", location_id: "salon", state: "COMPLETED", closed_at: "2026-10-12T01:00:00Z", customer_id: "private-buyer", line_items: [{ uid: "line", name: "Pac-Technologies bottle", quantity: "1.5", base_price_money: { amount: 1200 }, total_money: { amount: 1800 }, total_tax_money: { amount: 150 } }] };
    const input = squareOrderInput(order)!;
    expect(input.p_lines[0]).toMatchObject({ catalog_object_id: null, quantity: 1.5, line_sell_price: 16.5 });
    expect(JSON.stringify(input)).not.toContain("private-buyer");
  });
  it("rejects missing dates and nonfinite quantities", () => {
    expect(() => squareOrderInput({ id: "order", location_id: "salon", state: "COMPLETED" })).toThrow();
    expect(() => squareOrderInput({ id: "order", location_id: "salon", state: "COMPLETED", closed_at: "2026-10-12T01:00:00Z", line_items: [{ uid: "line", quantity: "Infinity" }] })).toThrow();
  });
  it("refuses a differently denominated Square sale", () => {
    expect(() => squareOrderInput({ id: "order", location_id: "salon", state: "COMPLETED", closed_at: "2026-10-12T01:00:00Z", line_items: [{ uid: "line", quantity: "1", total_money: { amount: 1000, currency: "USD" } }] }, "AUD")).toThrow("currency");
  });
});
