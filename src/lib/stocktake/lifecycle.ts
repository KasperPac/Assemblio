export type StocktakeSessionStatus =
  | "draft"
  | "open"           // legacy
  | "counting"
  | "reconciliation"
  | "approved"
  | "completed"
  | "locked"         // legacy
  | "archived";      // legacy

export const stocktakeAllowedTransitions: Record<
  StocktakeSessionStatus,
  StocktakeSessionStatus[]
> = {
  draft:           ["counting"],
  open:            ["locked", "archived", "counting"], // legacy + migration path
  counting:        ["reconciliation"],
  reconciliation:  ["counting", "approved"],
  approved:        ["locked"],           // RPC handles approved→completed
  completed:       [],
  locked:          ["open", "approved", "archived"],
  archived:        [],
};

export function canTransitionStocktakeStatus(
  from: StocktakeSessionStatus,
  to: StocktakeSessionStatus
) {
  if (from === to) return false;
  return (stocktakeAllowedTransitions[from] ?? []).includes(to);
}

export function canEditStocktakeLines(status: StocktakeSessionStatus) {
  return status === "counting";
}

export function canSubmitForReview(status: StocktakeSessionStatus) {
  return status === "counting";
}

export function canApprove(status: StocktakeSessionStatus) {
  return status === "reconciliation";
}

export function canSendBackForRecount(status: StocktakeSessionStatus) {
  return status === "reconciliation";
}

export function canApplyStocktakeSession(status: StocktakeSessionStatus) {
  return status === "approved";
}

export function isCountingStatus(status: StocktakeSessionStatus) {
  return status === "counting" || status === "open";
}
