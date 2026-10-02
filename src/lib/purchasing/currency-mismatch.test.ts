import { describe, expect, it } from "vitest";
import { currencyMismatch } from "./currency-mismatch";

describe("currencyMismatch", () => {
  it("warns when Xero's base currency differs from the supplier's", () => {
    expect(currencyMismatch("USD", "AUD")).toEqual({ supplier: "USD", xero: "AUD" });
  });
  it("does not warn without Xero", () => {
    expect(currencyMismatch("USD", null)).toBeNull();
    expect(currencyMismatch("USD", undefined)).toBeNull();
  });
  it("does not warn when the currencies match or the supplier has none", () => {
    expect(currencyMismatch("AUD", "AUD")).toBeNull();
    expect(currencyMismatch(null, "AUD")).toBeNull();
  });
});
