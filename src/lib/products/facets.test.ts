import { describe, it, expect } from "vitest";
import { buildFacets } from "./facets";

describe("buildFacets", () => {
  it("builds distinct sorted option lists", () => {
    const products = [
      { id: "p1", product_type: "Candle", tags: ["gift", "summer"], category_name: "Candles" },
      { id: "p2", product_type: "candle", tags: ["gift"], category_name: null },
      { id: "p3", product_type: null, tags: [], category_name: "Soap" },
    ];
    const collectionsByProduct = new Map<string, Array<{ id: string; title: string }>>([
      ["p1", [{ id: "c1", title: "New" }, { id: "c2", title: "Best" }]],
      ["p2", [{ id: "c2", title: "Best" }]],
    ]);
    const facets = buildFacets(products, collectionsByProduct);
    expect(facets.productTypes).toEqual(["Candle", "candle"]); // distinct values, sorted case-insensitively
    expect(facets.tags).toEqual(["gift", "summer"]);
    expect(facets.categories).toEqual(["Candles", "Soap"]);
    expect(facets.collections).toEqual([
      { id: "c2", title: "Best" },
      { id: "c1", title: "New" },
    ]);
  });

  it("handles empty input", () => {
    const facets = buildFacets([], new Map());
    expect(facets).toEqual({ productTypes: [], tags: [], categories: [], collections: [] });
  });
});
