import type { BlockedStep } from "./types";

// NOTE: computeUnlocked is called inside completeStep which performs multiple
// sequential DB reads + a final write. Concurrent completeStep calls on the
// same order line could theoretically produce stale completedSeqs.
// Acceptable for MVP — fix with a Postgres RPC function if this becomes a problem.
export function computeUnlocked(
  blockedSteps: BlockedStep[],
  completedSeqs: Set<number>
): BlockedStep[] {
  return blockedSteps.filter((step) =>
    step.blocked_by.every((seq) => completedSeqs.has(seq))
  );
}
