import { describe, expect, it } from "vitest";
import { computeUnlocked } from "./unlock-cascade";

type BlockedStep = { id: string; sequence: number; blocked_by: number[] };

describe("computeUnlocked", () => {
  it("returns steps whose all blockers are in completedSeqs", () => {
    const blocked: BlockedStep[] = [
      { id: "b", sequence: 2, blocked_by: [1] },
      { id: "c", sequence: 3, blocked_by: [1, 2] },
      { id: "d", sequence: 4, blocked_by: [3] },
    ];
    const completedSeqs = new Set([1, 2]);
    const result = computeUnlocked(blocked, completedSeqs);
    expect(result.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("returns empty array when no steps are fully unblocked", () => {
    const blocked: BlockedStep[] = [{ id: "b", sequence: 2, blocked_by: [1] }];
    const completedSeqs = new Set<number>();
    expect(computeUnlocked(blocked, completedSeqs)).toEqual([]);
  });
});
