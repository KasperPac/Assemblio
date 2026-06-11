import { describe, expect, it } from "vitest";
import { parseQtyInput } from "./qty-input";

describe("parseQtyInput", () => {
  it("parses positive integers", () => {
    expect(parseQtyInput("2")).toBe(2);
  });

  it("parses decimals like 0.5", () => {
    expect(parseQtyInput("0.5")).toBe(0.5);
  });

  it("trims whitespace", () => {
    expect(parseQtyInput(" 1.25 ")).toBe(1.25);
  });

  it("returns null for empty string", () => {
    expect(parseQtyInput("")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parseQtyInput("0")).toBeNull();
  });

  it("returns null for incomplete decimal that parses to zero", () => {
    expect(parseQtyInput("0.")).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(parseQtyInput("-1")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseQtyInput("abc")).toBeNull();
  });
});
