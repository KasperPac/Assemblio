import { describe, expect, it } from "vitest";
import { squareAvailableStock } from "./stock";
describe("Square available stock", () => {
  it("subtracts reservations and clamps exhausted stock", () => {
    expect(squareAvailableStock(12, 3)).toBe(9);
    expect(squareAvailableStock(2, 3)).toBe(0);
    expect(squareAvailableStock(-2, 0)).toBe(0);
  });
  it("keeps fractional retail quantities", () => expect(squareAvailableStock(2.75, 0.25)).toBe(2.5));
  it("refuses invalid ledger inputs", () => {
    expect(() => squareAvailableStock(NaN, 0)).toThrow();
    expect(() => squareAvailableStock(12, -1)).toThrow();
  });
});
