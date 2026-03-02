import { describe, expect, it } from "vitest";
import { reconcileInventoryBalances } from "./reconciliation";

describe("inventory reconciliation", () => {
  it("returns no issues when movement totals match balances", () => {
    const issues = reconcileInventoryBalances(
      [
        {
          componentId: "c1",
          locationId: "l1",
          componentName: "Clamp",
          locationName: "Main",
          onHand: 10,
          inProd: 3,
        },
      ],
      [
        {
          componentId: "c1",
          locationId: "l1",
          deltaOnHand: 7,
          deltaInProd: 1,
        },
        {
          componentId: "c1",
          locationId: "l1",
          deltaOnHand: 3,
          deltaInProd: 2,
        },
      ]
    );
    expect(issues).toHaveLength(0);
  });

  it("flags drift between balances and movement totals", () => {
    const issues = reconcileInventoryBalances(
      [
        {
          componentId: "c1",
          locationId: "l1",
          componentName: "Clamp",
          locationName: "Main",
          onHand: 15,
          inProd: 3,
        },
      ],
      [
        {
          componentId: "c1",
          locationId: "l1",
          deltaOnHand: 10,
          deltaInProd: 2,
        },
      ]
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.onHandDelta).toBe(5);
    expect(issues[0]?.inProdDelta).toBe(1);
  });
});
