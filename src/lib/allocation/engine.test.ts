import { describe, expect, it } from "vitest";
import {
  buildRequiredComponentQuantities,
  buildReservedMutation,
  getNextReserved,
  groupAllocationRows,
} from "./engine";

describe("allocation engine", () => {
  it("rolls up duplicate BOM component rows", () => {
    const required = buildRequiredComponentQuantities(3, [
      { component_id: "c1", quantity: 2 },
      { component_id: "c1", quantity: 1.5 },
      { component_id: "c2", quantity: 4 },
    ]);

    expect(required.get("c1")).toBe(10.5);
    expect(required.get("c2")).toBe(12);
  });

  it("groups duplicate allocation rows by component", () => {
    const grouped = groupAllocationRows([
      { id: "a1", component_id: "c1", quantity: 5 },
      { id: "a2", component_id: "c1", quantity: 1 },
      { id: "a3", component_id: "c2", quantity: 2 },
    ]);

    expect(grouped.get("c1")).toEqual({
      componentId: "c1",
      ids: ["a1", "a2"],
      totalQty: 6,
      primaryId: "a1",
      duplicateIds: ["a2"],
    });
    expect(grouped.get("c2")?.totalQty).toBe(2);
  });

  it("produces paired reservation mutation details", () => {
    const reserve = buildReservedMutation(7);
    const release = buildReservedMutation(-4);

    expect(reserve).toEqual({
      deltaReserved: 7,
      deltaOnHand: -7,
      reason: "order_reserve",
    });
    expect(release).toEqual({
      deltaReserved: -4,
      deltaOnHand: 4,
      reason: "order_release",
    });
    expect(buildReservedMutation(0)).toBeNull();
  });

  it("clamps reserved balance at zero", () => {
    expect(getNextReserved(10, -3)).toBe(7);
    expect(getNextReserved(2, -5)).toBe(0);
    expect(getNextReserved(0, 6)).toBe(6);
  });
});
