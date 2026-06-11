import { describe, it, expect } from "vitest";
import { buildPublishedLines, inheritStatus } from "./publish";

type CompLine = { component_id: string; quantity: number };

describe("buildPublishedLines", () => {
  const tpl = (id: string, component_id: string, quantity: number) => ({
    id,
    component_id,
    quantity,
  });
  const existing = (
    component_id: string,
    quantity: number,
    source_template_line_id: string | null
  ) => ({ component_id, quantity, source_template_line_id });

  it("keeps manual lines as-is", () => {
    const result = buildPublishedLines<CompLine>(
      [existing("c-manual", 5, null)],
      [tpl("t1", "c1", 2)]
    );
    expect(result).toContainEqual({
      component_id: "c-manual",
      quantity: 5,
      source_template_line_id: null,
    });
  });

  it("regenerates template lines with fresh provenance, resetting qty overrides", () => {
    // BOM had t1's line with an overridden qty of 99; template says 2.
    const result = buildPublishedLines<CompLine>(
      [existing("c1", 99, "t1")],
      [tpl("t1", "c1", 2)]
    );
    expect(result).toEqual([
      { component_id: "c1", quantity: 2, source_template_line_id: "t1" },
    ]);
  });

  it("re-adds template lines that were manually deleted from the BOM", () => {
    const result = buildPublishedLines<CompLine>(
      [],
      [tpl("t1", "c1", 2), tpl("t2", "c2", 4)]
    );
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.source_template_line_id).sort()).toEqual(["t1", "t2"]);
  });

  it("drops old template-provenance lines no longer in the template", () => {
    const result = buildPublishedLines<CompLine>(
      [existing("c-old", 1, "t-deleted")],
      [tpl("t1", "c1", 2)]
    );
    expect(result).toEqual([
      { component_id: "c1", quantity: 2, source_template_line_id: "t1" },
    ]);
  });

  it("merges manual and template lines (template first, then manual)", () => {
    const result = buildPublishedLines<CompLine>(
      [existing("c-manual", 5, null), existing("c1", 99, "t1")],
      [tpl("t1", "c1", 2)]
    );
    expect(result).toEqual([
      { component_id: "c1", quantity: 2, source_template_line_id: "t1" },
      { component_id: "c-manual", quantity: 5, source_template_line_id: null },
    ]);
  });

  it("works with labor-shaped fields", () => {
    type LaborLine = { department_id: string; operation_name: string; sequence: number; setup_hours: number };
    const result = buildPublishedLines<LaborLine>(
      [{ department_id: "d2", operation_name: "Manual op", sequence: 9, setup_hours: 0, source_template_line_id: null }],
      [{ id: "lt1", department_id: "d1", operation_name: "CNC", sequence: 1, setup_hours: 0.5 }]
    );
    expect(result).toEqual([
      { department_id: "d1", operation_name: "CNC", sequence: 1, setup_hours: 0.5, source_template_line_id: "lt1" },
      { department_id: "d2", operation_name: "Manual op", sequence: 9, setup_hours: 0, source_template_line_id: null },
    ]);
  });
});

describe("inheritStatus", () => {
  it("active rolls to active and archives the old version", () => {
    expect(inheritStatus("active")).toEqual({
      newStatus: "active",
      newIsActive: true,
      archiveOld: true,
    });
  });

  it("draft rolls to draft and leaves the old version unchanged", () => {
    expect(inheritStatus("draft")).toEqual({
      newStatus: "draft",
      newIsActive: false,
      archiveOld: false,
    });
  });
});
