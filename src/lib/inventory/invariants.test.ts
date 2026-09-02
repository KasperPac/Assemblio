import { describe, expect, it } from "vitest";
import { findInventoryInvariantIssues } from "./invariants";

describe("inventory invariant checks", () => {
  it("returns no issues for healthy rows", () => {
    const issues = findInventoryInvariantIssues([
      {
        componentName: "Clamp Body",
        locationName: "Main",
        onHand: 100,
        inProd: 10,
        reserved: 30,
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it("flags negative quantities and over-reservation", () => {
    const issues = findInventoryInvariantIssues([
      {
        componentName: "Steel Insert",
        locationName: "Main",
        onHand: -2,
        inProd: -1,
        reserved: -5,
      },
      {
        componentName: "IO Module",
        locationName: "Main",
        onHand: 5,
        inProd: 0,
        reserved: 9,
      },
    ]);

    // Steel Insert is negative on all three counters, but available is
    // -2 - (-5) = +3, so it is not over-reserved. Only IO Module is
    // (5 - 9 = -4). Asserting the owning row as well as the type keeps
    // that distinction from silently rotting.
    expect(issues.map((issue) => [issue.componentName, issue.type])).toEqual([
      ["Steel Insert", "negative_on_hand"],
      ["Steel Insert", "negative_in_prod"],
      ["Steel Insert", "negative_reserved"],
      ["IO Module", "over_reserved"],
    ]);
  });
});
