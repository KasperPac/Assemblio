import { describe, expect, it } from "vitest";
import {
  parseEntryHours,
  parseEntryTimestamp,
  validateActualTimeEntry,
} from "./entry";

describe("actual-time hours parsing", () => {
  it("parses whole and fractional hours", () => {
    expect(parseEntryHours("8")).toBe(8);
    expect(parseEntryHours("1.25")).toBe(1.25);
  });

  it("returns null when the field is absent or unparseable", () => {
    expect(parseEntryHours(null)).toBeNull();
    expect(parseEntryHours("abc")).toBeNull();
  });

  it("reads an empty field as 0 — validation is what rejects it", () => {
    // Number("") is 0, not NaN. Documented here because the rejection comes
    // from validateActualTimeEntry's "> 0" rule, not from parsing.
    expect(parseEntryHours("")).toBe(0);
    expect(validateActualTimeEntry({ orderLineId: "l", departmentId: "d", hours: 0 }).ok).toBe(false);
  });
});

describe("actual-time timestamp parsing", () => {
  it("normalises a datetime-local value to ISO", () => {
    expect(parseEntryTimestamp("2026-09-03T09:30:00.000Z")).toBe("2026-09-03T09:30:00.000Z");
  });

  it("returns null for blank, whitespace or missing input", () => {
    expect(parseEntryTimestamp("")).toBeNull();
    expect(parseEntryTimestamp("   ")).toBeNull();
    expect(parseEntryTimestamp(null)).toBeNull();
  });

  it("drops an unparseable timestamp instead of throwing", () => {
    expect(parseEntryTimestamp("not a date")).toBeNull();
    expect(parseEntryTimestamp("2026-13-45")).toBeNull();
  });
});

describe("actual-time entry validation", () => {
  const valid = { orderLineId: "line_1", departmentId: "dept_1", hours: 4 };

  it("accepts a complete entry", () => {
    expect(validateActualTimeEntry(valid)).toEqual({ ok: true });
  });

  it("requires the order line and the department", () => {
    expect(validateActualTimeEntry({ ...valid, orderLineId: undefined })).toEqual({
      ok: false,
      error: "Order line and department are required.",
    });
    expect(validateActualTimeEntry({ ...valid, departmentId: "" })).toEqual({
      ok: false,
      error: "Order line and department are required.",
    });
  });

  it("rejects zero, negative and missing hours", () => {
    // These would otherwise land in job costing and department utilisation
    // as entries that mean nothing.
    for (const hours of [0, -1, null]) {
      expect(validateActualTimeEntry({ ...valid, hours }), String(hours)).toEqual({
        ok: false,
        error: "Hours must be greater than zero.",
      });
    }
  });

  it("rejects a non-finite hours value", () => {
    expect(validateActualTimeEntry({ ...valid, hours: Infinity }).ok).toBe(false);
    expect(validateActualTimeEntry({ ...valid, hours: NaN }).ok).toBe(false);
  });
});
