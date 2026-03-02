import { describe, expect, it } from "vitest";
import {
  canApplyStocktakeSession,
  canEditStocktakeLines,
  canTransitionStocktakeStatus,
} from "./lifecycle";

describe("stocktake lifecycle rules", () => {
  it("enforces valid status transitions", () => {
    expect(canTransitionStocktakeStatus("open", "locked")).toBe(true);
    expect(canTransitionStocktakeStatus("locked", "approved")).toBe(true);
    expect(canTransitionStocktakeStatus("approved", "completed")).toBe(false);
    expect(canTransitionStocktakeStatus("approved", "locked")).toBe(true);
    expect(canTransitionStocktakeStatus("completed", "open")).toBe(false);
    expect(canTransitionStocktakeStatus("archived", "open")).toBe(false);
  });

  it("allows line editing only when open", () => {
    expect(canEditStocktakeLines("open")).toBe(true);
    expect(canEditStocktakeLines("locked")).toBe(false);
    expect(canEditStocktakeLines("approved")).toBe(false);
  });

  it("allows apply only when approved", () => {
    expect(canApplyStocktakeSession("approved")).toBe(true);
    expect(canApplyStocktakeSession("open")).toBe(false);
    expect(canApplyStocktakeSession("locked")).toBe(false);
    expect(canApplyStocktakeSession("completed")).toBe(false);
  });
});
