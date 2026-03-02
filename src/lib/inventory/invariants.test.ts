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

    expect(issues.map((issue) => issue.type)).toEqual([
      "negative_on_hand",
      "negative_in_prod",
      "negative_reserved",
      "over_reserved",
      "over_reserved",
    ]);
  });
});
