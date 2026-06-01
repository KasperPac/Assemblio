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

  // --- Components state tests ---

  it("empty — order with zero lines", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-empty",
      orderStatus: "open",
      targetShipDate: null,
      lines: [],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.components).toEqual({ kind: "empty" });
  });

  it("bom-needed — line with null bom", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-bom-null",
      orderStatus: "open",
      targetShipDate: null,
      lines: [{ bom: null, componentCount: 0, shortComponents: [], shippedAt: null }],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.components).toEqual({ kind: "bom-needed" });
  });

  it("bom-needed supersedes partial — mix of bom-null line and ready line", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-bom-supersede",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
        { bom: null, componentCount: 0, shortComponents: [], shippedAt: null },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.components).toEqual({ kind: "bom-needed" });
  });

  it("partial with ETA — one ready line, one short line with ETA", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-partial-eta",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
        {
          bom: { id: "b2" },
          componentCount: 2,
          shortComponents: [{ componentId: "c1", earliestEta: new Date("2026-06-10") }],
          shippedAt: null,
        },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.components).toEqual({
      kind: "partial",
      readyLines: 1,
      totalLines: 2,
      earliestEta: new Date("2026-06-10"),
    });
  });

  it("partial with null ETA — one ready, one short but no PO ETA", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-partial-no-eta",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
        {
          bom: { id: "b2" },
          componentCount: 2,
          shortComponents: [{ componentId: "c1", earliestEta: null }],
          shippedAt: null,
        },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.components).toEqual({
      kind: "partial",
      readyLines: 1,
      totalLines: 2,
      earliestEta: null,
    });
  });

  it("awaiting with ETA — no ready lines, short has ETA", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-awaiting",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        {
          bom: { id: "b1" },
          componentCount: 2,
          shortComponents: [{ componentId: "c1", earliestEta: new Date("2026-06-15") }],
          shippedAt: null,
        },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.components).toEqual({ kind: "awaiting", earliestEta: new Date("2026-06-15") });
  });

  it("no-eta — no ready lines, short has no ETA", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-no-eta",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        {
          bom: { id: "b1" },
          componentCount: 2,
          shortComponents: [{ componentId: "c1", earliestEta: null }],
          shippedAt: null,
        },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.components).toEqual({ kind: "no-eta" });
  });

  // --- Production state tests ---

  it("not-started when snapshots exist but no actual time", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-prod-not-started",
      orderStatus: "open",
      targetShipDate: null,
      lines: [{ bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null }],
      snapshots: [{ status: "pending" }],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.production).toBe("not-started");
  });

  it("in-progress when actuals exist and not all completed", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-prod-in-progress",
      orderStatus: "open",
      targetShipDate: null,
      lines: [{ bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null }],
      snapshots: [{ status: "pending" }, { status: "completed" }],
      hasAnyActualTime: true,
      now: new Date("2026-06-01"),
    });

    expect(rollup.production).toBe("in-progress");
  });

  it("done when all snapshots completed", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-prod-done",
      orderStatus: "open",
      targetShipDate: null,
      lines: [{ bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null }],
      snapshots: [{ status: "completed" }, { status: "completed" }],
      hasAnyActualTime: true,
      now: new Date("2026-06-01"),
    });

    expect(rollup.production).toBe("done");
  });

  // --- Delivery state tests ---

  it("n-a when no lines", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-delivery-na",
      orderStatus: "open",
      targetShipDate: null,
      lines: [],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.delivery).toBe("n-a");
  });

  it("not-shipped when all lines have shippedAt=null", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-delivery-not-shipped",
      orderStatus: "open",
      targetShipDate: null,
      lines: [{ bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null }],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.delivery).toBe("not-shipped");
  });

  it("partially-shipped when some shipped, some not", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-delivery-partial",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: new Date("2026-06-01") },
        { bom: { id: "b2" }, componentCount: 2, shortComponents: [], shippedAt: null },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.delivery).toBe("partially-shipped");
  });

  it("shipped when all lines have shippedAt", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-delivery-shipped",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: new Date("2026-06-01") },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.delivery).toBe("shipped");
  });

  // --- isOverdue edge cases ---

  it("not overdue when shipped even if target date passed", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-overdue-shipped",
      orderStatus: "open",
      targetShipDate: new Date("2026-05-01"),
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: new Date("2026-05-31") },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.isOverdue).toBe(false);
  });

  it("not overdue when targetShipDate is null", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o-overdue-no-target",
      orderStatus: "open",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-06-01"),
    });

    expect(rollup.isOverdue).toBe(false);
  });
});
