import { describe, expect, it } from "vitest";
import { deriveAllocationState } from "./order-line-status";

describe("deriveAllocationState", () => {
  it("returns 'no-bom' when bom is null", () => {
    expect(deriveAllocationState(null, 0, 0)).toBe("no-bom");
  });

  it("returns 'empty-bom' when bom exists but has no components", () => {
    expect(deriveAllocationState({ id: "bom-1" }, 0, 0)).toBe("empty-bom");
  });

  it("returns 'allocated' when bom has components (regardless of allocatedQty)", () => {
    expect(deriveAllocationState({ id: "bom-1" }, 3, 9)).toBe("allocated");
  });

  it("returns 'allocated' even when allocatedQty is 0 — state is based on BOM, not allocation rows", () => {
    expect(deriveAllocationState({ id: "bom-1" }, 2, 0)).toBe("allocated");
  });
});

describe("ComponentStatus shape", () => {
  it("includes earliestPoEta field on the type", () => {
    // Compile-time check: this assignment must type-check.
    // (Runtime no-op — purely guards the type contract.)
    const _check: import("./order-line-status").ComponentStatus = {
      componentId: "c1",
      name: "Bolt",
      requiredQty: 10,
      availableQty: 4,
      isShort: true,
      costPerUnit: 0.5,
      earliestPoEta: new Date("2026-06-02"),
    };
    expect(_check.earliestPoEta).toBeInstanceOf(Date);
  });
});
