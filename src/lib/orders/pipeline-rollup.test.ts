// src/lib/orders/pipeline-rollup.test.ts
import { describe, expect, it, vi } from "vitest";
import { rollupOrderPipeline } from "./pipeline-rollup";

describe("rollupOrderPipeline (pure composition)", () => {
  it("composes in-stock components + not-started production + not-shipped delivery", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o1",
      orderStatus: "open",
      targetShipDate: new Date("2026-06-03"),
      lines: [
        {
          bom: { id: "b1" },
          componentCount: 3,
          shortComponents: [],
          shippedAt: null,
        },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-05-27"),
    });

    expect(rollup.components).toEqual({ kind: "in-stock" });
    expect(rollup.production).toBe("not-started");
    expect(rollup.delivery).toBe("not-shipped");
    expect(rollup.isOverdue).toBe(false);
  });

  it("flags overdue when target is past and not shipped", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o2",
      orderStatus: "open",
      targetShipDate: new Date("2026-05-20"),
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-05-27"),
    });

    expect(rollup.isOverdue).toBe(true);
  });

  it("marks cancelled production when order is cancelled", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o3",
      orderStatus: "cancelled",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
      ],
      snapshots: [{ status: "completed" }],
      hasAnyActualTime: true,
      now: new Date("2026-05-27"),
    });

    expect(rollup.production).toBe("cancelled");
  });
});
