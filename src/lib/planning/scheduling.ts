import type { BomLaborRow, ScheduledStep } from "./types";

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Greedy earliest-available scheduling.
 * Steps with empty blocked_by start at startFrom (initialStatus='queued').
 * Steps with non-empty blocked_by start after all blockers complete (initialStatus='blocked').
 */
export function scheduleJob(
  laborSteps: BomLaborRow[],
  quantity: number,
  startFrom: Date
): ScheduledStep[] {
  const completionBySeq = new Map<number, Date>();
  const sorted = [...laborSteps].sort((a, b) => a.sequence - b.sequence);

  return sorted.map((step) => {
    let earliestStart = startFrom;
    for (const seq of step.blocked_by) {
      const blockerEnd = completionBySeq.get(seq);
      if (blockerEnd && blockerEnd > earliestStart) {
        earliestStart = blockerEnd;
      }
    }

    const durationHours = step.setup_hours + step.run_hours_per_unit * quantity;
    const scheduledEnd = addHours(earliestStart, durationHours);
    completionBySeq.set(step.sequence, scheduledEnd);

    return {
      bomLaborId: step.id,
      departmentId: step.department_id,
      sequence: step.sequence,
      blockedBy: step.blocked_by,
      operationName: step.operation_name,
      scheduledStart: earliestStart,
      scheduledEnd,
      initialStatus: step.blocked_by.length === 0 ? "queued" : "blocked",
    };
  });
}
