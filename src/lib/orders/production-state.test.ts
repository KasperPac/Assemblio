// src/lib/orders/production-state.test.ts
import { describe, expect, it } from "vitest";
import { deriveProductionState } from "./production-state";

describe("deriveProductionState", () => {
  it("returns 'cancelled' when order status is cancelled (supersedes)", () => {
    expect(
      deriveProductionState({
        orderStatus: "cancelled",
        snapshots: [{ status: "completed" }],
        hasAnyActualTime: true,
      })
    ).toBe("cancelled");
  });

  it("returns 'not-started' when no snapshots exist", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [],
        hasAnyActualTime: false,
      })
    ).toBe("not-started");
  });

  it("returns 'not-started' when snapshots exist but zero actual time", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [{ status: "planned" }, { status: "planned" }],
        hasAnyActualTime: false,
      })
    ).toBe("not-started");
  });

  it("returns 'in-progress' when actual time exists but not all completed", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [{ status: "completed" }, { status: "planned" }],
        hasAnyActualTime: true,
      })
    ).toBe("in-progress");
  });

  it("returns 'done' when all snapshots are completed", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [{ status: "completed" }, { status: "completed" }],
        hasAnyActualTime: true,
      })
    ).toBe("done");
  });
});
