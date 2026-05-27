// src/lib/orders/delivery-state.test.ts
import { describe, expect, it } from "vitest";
import { deriveDeliveryState } from "./delivery-state";

describe("deriveDeliveryState", () => {
  it("returns 'n-a' when there are no lines", () => {
    expect(deriveDeliveryState([])).toBe("n-a");
  });

  it("returns 'not-shipped' when no line has shipped_at", () => {
    expect(
      deriveDeliveryState([{ shippedAt: null }, { shippedAt: null }])
    ).toBe("not-shipped");
  });

  it("returns 'partially-shipped' when some lines have shipped_at", () => {
    expect(
      deriveDeliveryState([
        { shippedAt: new Date("2026-05-26") },
        { shippedAt: null },
      ])
    ).toBe("partially-shipped");
  });

  it("returns 'shipped' when every line has shipped_at", () => {
    expect(
      deriveDeliveryState([
        { shippedAt: new Date("2026-05-26") },
        { shippedAt: new Date("2026-05-27") },
      ])
    ).toBe("shipped");
  });
});
