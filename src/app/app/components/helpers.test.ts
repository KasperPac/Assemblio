import { describe, it, expect } from "vitest";
import { getStockStatus } from "./helpers";

describe("getStockStatus", () => {
  it("returns critical when available is 0", () => {
    expect(getStockStatus(0, 10)).toBe("critical");
  });

  it("returns critical when available is negative", () => {
    expect(getStockStatus(-2, 10)).toBe("critical");
  });

  it("returns low when available is positive but below reorder point", () => {
    expect(getStockStatus(5, 10)).toBe("low");
  });

  it("returns ok when available equals reorder point", () => {
    expect(getStockStatus(10, 10)).toBe("ok");
  });

  it("returns ok when available exceeds reorder point", () => {
    expect(getStockStatus(50, 10)).toBe("ok");
  });

  it("returns ok when reorder point is 0 and available is positive", () => {
    expect(getStockStatus(5, 0)).toBe("ok");
  });

  it("returns critical when reorder point is 0 and available is 0", () => {
    expect(getStockStatus(0, 0)).toBe("critical");
  });
});
