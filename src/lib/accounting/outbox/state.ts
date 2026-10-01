// src/lib/accounting/outbox/state.ts
import type { ErrorClass } from "../xero/errors";
import { nextAttemptAt, nextUtcMidnight } from "./backoff";
import type { HandlerOutcome, OutboxJob } from "./handlers";

export type JobUpdate = {
  status: "sent" | "failed" | "gave_up" | "pending";
  attempts: number;
  next_attempt_at: string;
  error_class: ErrorClass | null;
  error_message: string | null;
  error_detail: unknown;
  external_id: string | null;
  completed_at: string | null;
  locked_at: null;
  locked_by: null;
};

export function nextJobState(
  job: Pick<OutboxJob, "attempts" | "first_attempt_at" | "external_id">,
  outcome: HandlerOutcome,
  now: Date
): JobUpdate {
  const iso = now.toISOString();
  const base = { locked_at: null, locked_by: null, external_id: job.external_id } as const;
  if (outcome.kind === "sent") {
    return {
      ...base, status: "sent", attempts: job.attempts + 1, next_attempt_at: iso,
      error_class: null, error_message: null, error_detail: outcome.note ?? null,
      external_id: outcome.externalId ?? job.external_id, completed_at: iso,
    };
  }
  const e = outcome.error;
  const errFields = { error_class: e.errorClass, error_message: e.message, error_detail: e.detail };
  switch (e.errorClass) {
    case "auth":
      return { ...base, ...errFields, status: "pending", attempts: job.attempts, next_attempt_at: iso, completed_at: null };
    case "daily_limit": {
      const next = e.retryAfterSec ? new Date(now.getTime() + e.retryAfterSec * 1000) : nextUtcMidnight(now);
      return { ...base, ...errFields, status: "failed", attempts: job.attempts, next_attempt_at: next.toISOString(), completed_at: null };
    }
    case "fixable":
      return { ...base, ...errFields, status: "failed", attempts: job.attempts + 1, next_attempt_at: iso, completed_at: null };
    case "transient": {
      const attempts = job.attempts + 1;
      const first = job.first_attempt_at ? new Date(job.first_attempt_at) : now;
      const next = nextAttemptAt(attempts, first, now, e.retryAfterSec);
      return next
        ? { ...base, ...errFields, status: "failed", attempts, next_attempt_at: next.toISOString(), completed_at: null }
        : { ...base, ...errFields, status: "gave_up", attempts, next_attempt_at: iso, completed_at: iso };
    }
  }
}

/** True when nothing will retry this job without a human: gave up, or failed for a reason only a person can fix. */
export function isFailedForGood(job: { status: string; error_class: ErrorClass | string | null }): boolean {
  return job.status === "gave_up" || (job.status === "failed" && (job.error_class === "fixable" || job.error_class === "auth"));
}

/** Handlers write the success states themselves; this mirrors failures and retries onto the invoice. */
export function invoiceSyncStatusFor(operation: OutboxJob["operation"], update: JobUpdate): "failed" | "queued" | null {
  if (operation === "create_contact" || update.status === "sent") return null;
  if (isFailedForGood(update)) return "failed";
  return "queued";
}
