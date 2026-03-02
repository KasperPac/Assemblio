export type StocktakeSessionStatus =
  | "open"
  | "locked"
  | "approved"
  | "completed"
  | "archived";

export const stocktakeAllowedTransitions: Record<
  StocktakeSessionStatus,
  StocktakeSessionStatus[]
> = {
  open: ["locked", "archived"],
  locked: ["open", "approved", "archived"],
  approved: ["locked", "archived"],
  completed: ["archived"],
  archived: [],
};

export function canTransitionStocktakeStatus(
  from: StocktakeSessionStatus,
  to: StocktakeSessionStatus
) {
  if (from === to) return false;
  return stocktakeAllowedTransitions[from].includes(to);
}

export function canEditStocktakeLines(status: StocktakeSessionStatus) {
  return status === "open";
}

export function canApplyStocktakeSession(status: StocktakeSessionStatus) {
  return status === "approved";
}
