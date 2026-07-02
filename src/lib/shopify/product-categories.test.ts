import { describe, it, expect } from "vitest";
import { normalizeProductCategories } from "./product-categories";

describe("normalizeProductCategories", () => {
  it("normalizes a fully-populated node", () => {
    const result = normalizeProductCategories({
      productType: " Candle ",
      tags: ["gift", " summer ", ""],
      category: { name: "Candles", fullName: "Home & Garden > Decor > Candles" },
      collections: {
        nodes: [
          { id: "gid://c/1", title: "Best Sellers", handle: "best-sellers" },
          { id: "gid://c/1", title: "Best Sellers", handle: "best-sellers" },
          { id: "gid://c/2", title: "New", handle: null },
        ],
      },
    });
    expect(result.productType).toBe("Candle");
    expect(result.tags).toEqual(["gift", "summer"]);
    expect(result.categoryName).toBe("Candles");
    expect(result.categoryFullName).toBe("Home & Garden > Decor > Candles");
    expect(result.collections).toEqual([
      { shopifyId: "gid://c/1", title: "Best Sellers", handle: "best-sellers" },
      { shopifyId: "gid://c/2", title: "New", handle: null },
    ]);
  });

  it("handles nulls and empties", () => {
    const result = normalizeProductCategories({
      productType: "   ",
      tags: [],
      category: null,
      collections: { nodes: [] },
    });
    expect(result.productType).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.categoryName).toBeNull();
    expect(result.categoryFullName).toBeNull();
    expect(result.collections).toEqual([]);
  });
});
