import { describe, it, expect } from "vitest";
import { evaluateBlockers } from "./blockers";

describe("evaluateBlockers", () => {
  it("is not blocked when all counts are zero", () => {
    const r = evaluateBlockers([
      { label: "on-hand stock", count: 0 },
      { label: "movement history", count: 0 },
    ]);
    expect(r.blocked).toBe(false);
    expect(r.reason).toBeNull();
  });

  it("blocks and names a single non-zero category", () => {
    const r = evaluateBlockers([
      { label: "on-hand stock", count: 3 },
      { label: "movement history", count: 0 },
    ]);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe(
      "Can't delete — still referenced by on-hand stock. Move or clear it first."
    );
  });

  it("joins two categories with 'and'", () => {
    const r = evaluateBlockers([
      { label: "on-hand stock", count: 3 },
      { label: "movement history", count: 5 },
    ]);
    expect(r.reason).toBe(
      "Can't delete — still referenced by on-hand stock and movement history. Move or clear it first."
    );
  });

  it("joins three or more categories with commas and a final 'and'", () => {
    const r = evaluateBlockers([
      { label: "on-hand stock", count: 1 },
      { label: "movement history", count: 2 },
      { label: "stocktake sessions", count: 4 },
    ]);
    expect(r.reason).toBe(
      "Can't delete — still referenced by on-hand stock, movement history and stocktake sessions. Move or clear it first."
    );
  });

  it("ignores zero counts when building the reason", () => {
    const r = evaluateBlockers([
      { label: "a", count: 0 },
      { label: "b", count: 7 },
      { label: "c", count: 0 },
    ]);
    expect(r.reason).toBe(
      "Can't delete — still referenced by b. Move or clear it first."
    );
  });
});
