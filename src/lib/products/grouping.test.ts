import { describe, it, expect } from "vitest";
import { matchesCategoryFilters, resolveGroupKey } from "./grouping";

const p = {
  id: "p1",
  product_type: "Candle",
  tags: ["gift", "summer"],
  category_name: "Candles",
};
const collections = [
  { id: "c1", title: "Best Sellers" },
  { id: "c2", title: "New" },
];

describe("matchesCategoryFilters", () => {
  it("matches when no filters set", () => {
    expect(matchesCategoryFilters(p, collections, {})).toBe(true);
  });
  it("matches product_type exactly", () => {
    expect(matchesCategoryFilters(p, collections, { type: "Candle" })).toBe(true);
    expect(matchesCategoryFilters(p, collections, { type: "Soap" })).toBe(false);
  });
  it("requires ALL selected tags", () => {
    expect(matchesCategoryFilters(p, collections, { tags: ["gift"] })).toBe(true);
    expect(matchesCategoryFilters(p, collections, { tags: ["gift", "winter"] })).toBe(false);
  });
  it("matches ANY selected collection", () => {
    expect(matchesCategoryFilters(p, collections, { collections: ["c2", "c9"] })).toBe(true);
    expect(matchesCategoryFilters(p, collections, { collections: ["c9"] })).toBe(false);
  });
  it("matches category", () => {
    expect(matchesCategoryFilters(p, collections, { category: "Candles" })).toBe(true);
  });
});

describe("resolveGroupKey", () => {
  it("returns empty for none", () => {
    expect(resolveGroupKey(p, collections, "none")).toBe("");
  });
  it("groups by type/category/collection", () => {
    expect(resolveGroupKey(p, collections, "type")).toBe("Candle");
    expect(resolveGroupKey(p, collections, "category")).toBe("Candles");
    expect(resolveGroupKey(p, collections, "collection")).toBe("Best Sellers");
  });
  it("returns Uncategorised for nulls/empties", () => {
    expect(resolveGroupKey({ ...p, product_type: null }, [], "type")).toBe("Uncategorised");
    expect(resolveGroupKey({ ...p, category_name: null }, [], "category")).toBe("Uncategorised");
    expect(resolveGroupKey(p, [], "collection")).toBe("Uncategorised");
  });
});
