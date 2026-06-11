import { describe, expect, it } from "vitest";
import { parseSortParams, sortProductRows, type ProductSortRow } from "./sort";

function row(overrides: Partial<ProductSortRow>): ProductSortRow {
  return {
    title: "Widget",
    variantCount: 0,
    status: "active",
    sellPrice: null,
    matGpPct: null,
    actualGpPct: null,
    ...overrides,
  };
}

describe("parseSortParams", () => {
  it("accepts valid keys and directions", () => {
    expect(parseSortParams("price", "desc")).toEqual({ sort: "price", dir: "desc" });
  });

  it("rejects invalid sort key", () => {
    expect(parseSortParams("bogus", "asc")).toEqual({ sort: null, dir: "asc" });
  });

  it("defaults missing/invalid dir to asc", () => {
    expect(parseSortParams("title", "sideways")).toEqual({ sort: "title", dir: "asc" });
    expect(parseSortParams("title", undefined)).toEqual({ sort: "title", dir: "asc" });
  });
});

describe("sortProductRows", () => {
  it("returns rows unchanged when sort is null", () => {
    const rows = [row({ title: "B" }), row({ title: "A" })];
    expect(sortProductRows(rows, null, "asc")).toEqual(rows);
  });

  it("sorts titles case-insensitively", () => {
    const rows = [row({ title: "banana" }), row({ title: "Apple" })];
    const sorted = sortProductRows(rows, "title", "asc");
    expect(sorted.map((r) => r.title)).toEqual(["Apple", "banana"]);
  });

  it("sorts numbers descending", () => {
    const rows = [row({ variantCount: 1 }), row({ variantCount: 3 })];
    const sorted = sortProductRows(rows, "variants", "desc");
    expect(sorted.map((r) => r.variantCount)).toEqual([3, 1]);
  });

  it("puts null prices last in both directions", () => {
    const rows = [row({ sellPrice: null, title: "N" }), row({ sellPrice: 10, title: "P" })];
    expect(sortProductRows(rows, "price", "asc").map((r) => r.title)).toEqual(["P", "N"]);
    expect(sortProductRows(rows, "price", "desc").map((r) => r.title)).toEqual(["P", "N"]);
  });

  it("sorts GP percentages", () => {
    const rows = [
      row({ actualGpPct: 0.1, title: "low" }),
      row({ actualGpPct: 0.5, title: "high" }),
      row({ actualGpPct: null, title: "none" }),
    ];
    const sorted = sortProductRows(rows, "actual_gp", "desc");
    expect(sorted.map((r) => r.title)).toEqual(["high", "low", "none"]);
  });

  it("does not mutate the input array", () => {
    const rows = [row({ title: "B" }), row({ title: "A" })];
    sortProductRows(rows, "title", "asc");
    expect(rows.map((r) => r.title)).toEqual(["B", "A"]);
  });
});
