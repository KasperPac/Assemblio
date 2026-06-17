import { describe, expect, it } from "vitest";
import { parseActivityFilters, activityRange, totalPages, ACTIVITY_PAGE_SIZE } from "./query";

describe("parseActivityFilters", () => {
  it("defaults to page 1 and empty filters", () => {
    expect(parseActivityFilters({})).toEqual({
      page: 1, event: null, actorId: null, dateFrom: null, dateTo: null, search: null,
    });
  });

  it("parses provided params and clamps page to >= 1", () => {
    const f = parseActivityFilters({
      page: "0", event: "bom.created", actor: "u1", from: "2026-01-01", to: "2026-02-01", q: "PO",
    });
    expect(f).toEqual({
      page: 1, event: "bom.created", actorId: "u1",
      dateFrom: "2026-01-01", dateTo: "2026-02-01", search: "PO",
    });
  });

  it("takes the first value when a param is an array", () => {
    expect(parseActivityFilters({ page: ["3", "9"] }).page).toBe(3);
  });
});

describe("activityRange", () => {
  it("computes inclusive range for a page", () => {
    expect(activityRange(1)).toEqual({ from: 0, to: ACTIVITY_PAGE_SIZE - 1 });
    expect(activityRange(3)).toEqual({ from: 2 * ACTIVITY_PAGE_SIZE, to: 3 * ACTIVITY_PAGE_SIZE - 1 });
  });
});

describe("totalPages", () => {
  it("computes ceil(count / pageSize), min 1", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(1)).toBe(1);
    expect(totalPages(ACTIVITY_PAGE_SIZE)).toBe(1);
    expect(totalPages(ACTIVITY_PAGE_SIZE + 1)).toBe(2);
  });
});
