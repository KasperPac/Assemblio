import { describe, expect, it } from "vitest";
import { normaliseBarcode } from "./variant-fields";

describe("normaliseBarcode", () => {
  it("returns null for missing or blank values so empty barcodes never match each other", () => {
    expect(normaliseBarcode(null)).toBeNull();
    expect(normaliseBarcode(undefined)).toBeNull();
    expect(normaliseBarcode("")).toBeNull();
    expect(normaliseBarcode("   ")).toBeNull();
  });
  it("trims but otherwise preserves the value (leading zeros matter in a GTIN)", () => {
    expect(normaliseBarcode(" 0093000000017 ")).toBe("0093000000017");
  });
});
