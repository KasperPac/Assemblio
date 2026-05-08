type BlockedStep = { id: string; sequence: number; blocked_by: number[] };

export function computeUnlocked(
  blockedSteps: BlockedStep[],
  completedSeqs: Set<number>
): BlockedStep[] {
  return blockedSteps.filter((step) =>
    step.blocked_by.every((seq) => completedSeqs.has(seq))
  );
}
