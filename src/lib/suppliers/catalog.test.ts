import { describe, expect, it } from "vitest";
import {
  deriveLeadTimeStatus,
  resolvePriceForQuantity,
} from "./catalog";
import type { SupplierComponentPriceBreak } from "./types";

describe("deriveLeadTimeStatus", () => {
  it("returns on-time when avg equals promised", () => {
    expect(deriveLeadTimeStatus(7, 7)).toBe("on-time");
  });

  it("returns on-time when avg is less than promised", () => {
    expect(deriveLeadTimeStatus(5.5, 7)).toBe("on-time");
  });

  it("returns late when avg exceeds promised", () => {
    expect(deriveLeadTimeStatus(9.1, 7)).toBe("late");
  });
});

describe("resolvePriceForQuantity", () => {
  const breaks: SupplierComponentPriceBreak[] = [
    { id: "1", tenant_id: "t1", supplier_component_id: "x", min_quantity: 50, unit_cost: 3.8, created_at: "" },
    { id: "2", tenant_id: "t1", supplier_component_id: "x", min_quantity: 200, unit_cost: 3.4, created_at: "" },
  ];

  it("returns base cost when quantity is below the first break", () => {
    expect(resolvePriceForQuantity(breaks, 10, 4.2)).toBe(4.2);
  });

  it("returns first break price at exactly the first break quantity", () => {
    expect(resolvePriceForQuantity(breaks, 50, 4.2)).toBe(3.8);
  });

  it("returns first break price when quantity is between breaks", () => {
    expect(resolvePriceForQuantity(breaks, 100, 4.2)).toBe(3.8);
  });

  it("returns second break price at the second break quantity", () => {
    expect(resolvePriceForQuantity(breaks, 200, 4.2)).toBe(3.4);
  });

  it("returns base cost when breaks array is empty", () => {
    expect(resolvePriceForQuantity([], 100, 4.2)).toBe(4.2);
  });
});
