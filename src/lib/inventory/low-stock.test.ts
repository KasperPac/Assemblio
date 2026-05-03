import { describe, expect, it } from "vitest";
import { countLowStockComponents } from "./low-stock";

describe("low stock rollup", () => {
  it("treats components without balances as zero available", () => {
    const lowStockCount = countLowStockComponents(
      [
        { componentId: "c1", reorderPoint: 5 },
        { componentId: "c2", reorderPoint: 10 },
        { componentId: "c3", reorderPoint: 0 },
      ],
      []
    );

    expect(lowStockCount).toBe(2);
  });

  it("aggregates availability across balances and subtracts reserved stock", () => {
    const lowStockCount = countLowStockComponents(
      [
        { componentId: "c1", reorderPoint: 10 },
        { componentId: "c2", reorderPoint: 8 },
        { componentId: "c3", reorderPoint: 20 },
      ],
      [
        { componentId: "c1", onHand: 6, reserved: 2 },
        { componentId: "c1", onHand: 7, reserved: 0 },
        { componentId: "c2", onHand: 10, reserved: 3 },
        { componentId: "c3", onHand: 25, reserved: 0 },
      ]
    );

    expect(lowStockCount).toBe(1);
  });
});
