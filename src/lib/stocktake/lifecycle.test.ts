import { describe, expect, it } from "vitest";
import {
  canApplyStocktakeSession,
  canEditStocktakeLines,
  canTransitionStocktakeStatus,
  canSubmitForReview,
  canApprove,
  canSendBackForRecount,
  isCountingStatus,
} from "./lifecycle";

describe("stocktake lifecycle rules", () => {
  it("allows line editing when counting or open (legacy)", () => {
    expect(canEditStocktakeLines("counting")).toBe(true);
    expect(canEditStocktakeLines("open")).toBe(true); // legacy sessions remain editable
    expect(canEditStocktakeLines("reconciliation")).toBe(false);
    expect(canEditStocktakeLines("approved")).toBe(false);
  });

  it("enforces valid status transitions for new lifecycle", () => {
    expect(canTransitionStocktakeStatus("counting", "reconciliation")).toBe(true);
    expect(canTransitionStocktakeStatus("reconciliation", "approved")).toBe(true);
    expect(canTransitionStocktakeStatus("reconciliation", "counting")).toBe(true);
    expect(canTransitionStocktakeStatus("approved", "completed")).toBe(false); // RPC handles this
    expect(canTransitionStocktakeStatus("completed", "counting")).toBe(false);
  });

  it("enforces valid transitions for legacy statuses", () => {
    expect(canTransitionStocktakeStatus("open", "locked")).toBe(true);
    expect(canTransitionStocktakeStatus("locked", "approved")).toBe(true);
    expect(canTransitionStocktakeStatus("approved", "locked")).toBe(true);
    expect(canTransitionStocktakeStatus("draft", "counting")).toBe(true);
    expect(canTransitionStocktakeStatus("open", "counting")).toBe(true); // migration path
    expect(canTransitionStocktakeStatus("counting", "counting")).toBe(false); // same-status guard
  });

  it("canSubmitForReview: only from counting", () => {
    expect(canSubmitForReview("counting")).toBe(true);
    expect(canSubmitForReview("reconciliation")).toBe(false);
    expect(canSubmitForReview("open")).toBe(false);
  });

  it("canApprove: only from reconciliation", () => {
    expect(canApprove("reconciliation")).toBe(true);
    expect(canApprove("counting")).toBe(false);
    expect(canApprove("approved")).toBe(false);
  });

  it("canSendBackForRecount: only from reconciliation", () => {
    expect(canSendBackForRecount("reconciliation")).toBe(true);
    expect(canSendBackForRecount("counting")).toBe(false);
    expect(canSendBackForRecount("open")).toBe(false);
    expect(canSendBackForRecount("approved")).toBe(false);
  });

  it("allows apply only when approved", () => {
    expect(canApplyStocktakeSession("approved")).toBe(true);
    expect(canApplyStocktakeSession("counting")).toBe(false);
    expect(canApplyStocktakeSession("reconciliation")).toBe(false);
    expect(canApplyStocktakeSession("completed")).toBe(false);
  });

  it("isCountingStatus: identifies active counting statuses", () => {
    expect(isCountingStatus("counting")).toBe(true);
    expect(isCountingStatus("open")).toBe(true); // legacy sessions
    expect(isCountingStatus("reconciliation")).toBe(false);
    expect(isCountingStatus("completed")).toBe(false);
  });
});
