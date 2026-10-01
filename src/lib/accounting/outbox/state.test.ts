import { describe, expect, it } from "vitest";
import { invoiceSyncStatusFor, isFailedForGood, nextJobState } from "./state";

const now = new Date("2026-10-01T00:10:00Z");
const job = { attempts: 0, first_attempt_at: "2026-10-01T00:00:00Z", external_id: null };
const err = (errorClass: "transient" | "fixable" | "auth" | "daily_limit", retryAfterSec: number | null = null) =>
  ({ kind: "error" as const, error: { errorClass, message: "m", detail: null, retryAfterSec } });

describe("nextJobState", () => {
  it("sent completes the job and counts the attempt", () => {
    const u = nextJobState(job, { kind: "sent", externalId: "x", note: { rounding: 1 } }, now);
    expect(u).toMatchObject({ status: "sent", attempts: 1, external_id: "x", completed_at: now.toISOString(), error_class: null, error_detail: { rounding: 1 } });
  });
  it("transient schedules a retry", () => {
    const u = nextJobState(job, err("transient"), now);
    expect(u).toMatchObject({ status: "failed", attempts: 1, error_class: "transient", next_attempt_at: "2026-10-01T00:11:00.000Z" });
  });
  it("transient past 24h gives up", () => {
    const u = nextJobState({ ...job, attempts: 7, first_attempt_at: "2026-09-30T00:20:00Z" }, err("transient"), now);
    expect(u).toMatchObject({ status: "gave_up", completed_at: now.toISOString() });
  });
  it("fixable waits for a human", () => {
    expect(nextJobState(job, err("fixable"), now)).toMatchObject({ status: "failed", attempts: 1, error_class: "fixable" });
  });
  it("auth pauses without spending an attempt", () => {
    expect(nextJobState(job, err("auth"), now)).toMatchObject({ status: "pending", attempts: 0, error_class: "auth" });
  });
  it("daily_limit defers to Retry-After without spending an attempt", () => {
    expect(nextJobState(job, err("daily_limit", 3600), now)).toMatchObject({ status: "failed", attempts: 0, next_attempt_at: "2026-10-01T01:10:00.000Z" });
    expect(nextJobState(job, err("daily_limit"), now).next_attempt_at).toBe("2026-10-02T00:00:00.000Z");
  });
});

describe("invoiceSyncStatusFor", () => {
  it("mirrors failures onto bill invoices only", () => {
    expect(invoiceSyncStatusFor("create_bill", nextJobState(job, err("fixable"), now))).toBe("failed");
    expect(invoiceSyncStatusFor("void_bill", nextJobState(job, err("transient"), now))).toBe("queued");
    expect(invoiceSyncStatusFor("create_bill", nextJobState(job, { kind: "sent", externalId: "x" }, now))).toBeNull();
    expect(invoiceSyncStatusFor("create_contact", nextJobState(job, err("fixable"), now))).toBeNull();
  });
});

describe("isFailedForGood", () => {
  it("is true for gave_up and for failed fixable or auth, false otherwise", () => {
    expect(isFailedForGood({ status: "gave_up", error_class: "transient" })).toBe(true);
    expect(isFailedForGood({ status: "failed", error_class: "fixable" })).toBe(true);
    expect(isFailedForGood({ status: "failed", error_class: "auth" })).toBe(true);
    expect(isFailedForGood({ status: "failed", error_class: "transient" })).toBe(false);
    expect(isFailedForGood({ status: "failed", error_class: "daily_limit" })).toBe(false);
    expect(isFailedForGood({ status: "pending", error_class: "auth" })).toBe(false);
    expect(isFailedForGood({ status: "sent", error_class: null })).toBe(false);
  });
});
