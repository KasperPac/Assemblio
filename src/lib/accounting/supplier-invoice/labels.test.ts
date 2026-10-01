import { describe, expect, it } from "vitest";
import { invoiceBadge, jobBadge } from "./labels";

describe("invoiceBadge", () => {
  it.each([
    ["draft", "not_synced", "Draft", "default"],
    ["posted", "not_synced", "Posted", "default"],
    ["posted", "queued", "Queued for Xero", "info"],
    ["posted", "sent", "Sent to Xero", "success"],
    ["posted", "failed", "Xero sync failed", "danger"],
    ["voided", "queued", "Voiding in Xero", "warning"],
    ["voided", "failed", "Void in Xero failed", "danger"],
    ["voided", "voided_in_xero", "Voided", "default"],
  ])("%s/%s → %s", (status, sync, label, variant) => {
    expect(invoiceBadge(status, sync)).toEqual({ label, variant });
  });
});

describe("jobBadge", () => {
  it.each([
    ["pending", null, "Queued", "info"],
    ["pending", "auth", "Paused: reconnect Xero", "warning"],
    ["working", null, "Sending", "info"],
    ["sent", null, "Sent", "success"],
    ["failed", "fixable", "Needs attention", "danger"],
    ["failed", "transient", "Retrying", "warning"],
    ["failed", "daily_limit", "Waiting for Xero's daily limit", "warning"],
    ["gave_up", "transient", "Stopped retrying", "danger"],
    ["cancelled", null, "Cancelled", "default"],
  ])("%s/%s → %s", (status, cls, label, variant) => {
    expect(jobBadge(status, cls)).toEqual({ label, variant });
  });
});
