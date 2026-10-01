export const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720] as const;
export const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * attemptsMade counts the attempt that just failed (1 after the first failure).
 * Returns null when the job should give up.
 */
export function nextAttemptAt(attemptsMade: number, firstAttemptAt: Date, now: Date, retryAfterSec: number | null): Date | null {
  const idx = Math.min(Math.max(attemptsMade, 1), BACKOFF_MINUTES.length) - 1;
  const delayMs = retryAfterSec !== null && retryAfterSec > 0 ? retryAfterSec * 1000 : BACKOFF_MINUTES[idx] * 60_000;
  const next = new Date(now.getTime() + delayMs);
  if (next.getTime() - firstAttemptAt.getTime() > GIVE_UP_AFTER_MS) return null;
  return next;
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
