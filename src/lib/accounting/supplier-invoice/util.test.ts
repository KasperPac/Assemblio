import { describe, expect, it } from "vitest";
import { chunk, isUuid, one } from "./util";

describe("isUuid", () => {
  it("accepts a uuid and rejects junk", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("nope")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("one", () => {
  it("unwraps arrays and passes objects and nulls through", () => {
    expect(one([{ a: 1 }])).toEqual({ a: 1 });
    expect(one([])).toBeNull();
    expect(one({ a: 2 })).toEqual({ a: 2 });
    expect(one(null)).toBeNull();
    expect(one(undefined)).toBeNull();
  });
});

describe("chunk", () => {
  it("splits into groups of at most size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
