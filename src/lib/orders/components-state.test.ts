// src/lib/orders/components-state.test.ts
import { describe, expect, it } from "vitest";
import { deriveComponentsState } from "./components-state";

type Line = {
  bom: { id: string } | null;
  componentCount: number;
  shortComponents: Array<{ componentId: string; earliestEta: Date | null }>;
};

describe("deriveComponentsState", () => {
  it("returns { kind: 'empty' } for zero lines", () => {
    expect(deriveComponentsState([])).toEqual({ kind: "empty" });
  });

  it("returns 'bom-needed' when any line has no BOM", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 3, shortComponents: [] },
      { bom: null, componentCount: 0, shortComponents: [] },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "bom-needed" });
  });

  it("returns 'bom-needed' when any line has BOM with zero components", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 0, shortComponents: [] },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "bom-needed" });
  });

  it("returns 'in-stock' when every line is covered (no short components)", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 5, shortComponents: [] },
      { bom: { id: "b2" }, componentCount: 3, shortComponents: [] },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "in-stock" });
  });

  it("returns 'partial' when some lines ready and others short, with earliest ETA", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 5, shortComponents: [] },
      {
        bom: { id: "b2" },
        componentCount: 3,
        shortComponents: [
          { componentId: "c1", earliestEta: new Date("2026-06-10") },
          { componentId: "c2", earliestEta: new Date("2026-06-02") },
        ],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({
      kind: "partial",
      readyLines: 1,
      totalLines: 2,
      earliestEta: new Date("2026-06-02"),
    });
  });

  it("returns 'partial' with null ETA when no short component has an ETA", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 5, shortComponents: [] },
      {
        bom: { id: "b2" },
        componentCount: 3,
        shortComponents: [{ componentId: "c1", earliestEta: null }],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({
      kind: "partial",
      readyLines: 1,
      totalLines: 2,
      earliestEta: null,
    });
  });

  it("returns 'awaiting' when no line is fully covered and at least one ETA exists", () => {
    const lines: Line[] = [
      {
        bom: { id: "b1" },
        componentCount: 2,
        shortComponents: [
          { componentId: "c1", earliestEta: new Date("2026-06-10") },
        ],
      },
      {
        bom: { id: "b2" },
        componentCount: 1,
        shortComponents: [
          { componentId: "c2", earliestEta: new Date("2026-06-05") },
        ],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({
      kind: "awaiting",
      earliestEta: new Date("2026-06-05"),
    });
  });

  it("returns 'no-eta' when no line is fully covered and no short component has an ETA", () => {
    const lines: Line[] = [
      {
        bom: { id: "b1" },
        componentCount: 1,
        shortComponents: [{ componentId: "c1", earliestEta: null }],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "no-eta" });
  });
});
