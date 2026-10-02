import { describe, expect, it } from "vitest";
import { cardBadge, redirectMessage } from "./card-state";

const ALL_REASONS = [
  "not-admin", "not-available", "not-configured", "xero-denied", "xero-error", "no-session", "bad-state",
  "expired", "nonce-mismatch", "session-mismatch", "token-exchange", "connections", "no-organisation",
  "too-many-organisations", "organisation-read", "save-failed", "bad-organisation", "disconnect-failed",
];

describe("cardBadge", () => {
  it("is neutral when there is no live connection", () => {
    expect(cardBadge(null)).toEqual({ variant: "default", label: "Not connected" });
    expect(cardBadge({ status: "disconnected", setup_completed_at: null })).toEqual({ variant: "default", label: "Not connected" });
  });
  it("warns (not danger) when a reconnect is needed", () => {
    expect(cardBadge({ status: "needs_reconnect", setup_completed_at: "2026-01-01" })).toEqual({ variant: "warning", label: "Needs reconnect" });
  });
  it("warns when setup is incomplete", () => {
    expect(cardBadge({ status: "connected", setup_completed_at: null })).toEqual({ variant: "warning", label: "Finish setup" });
  });
  it("is success when connected and set up", () => {
    expect(cardBadge({ status: "connected", setup_completed_at: "2026-01-01" })).toEqual({ variant: "success", label: "Connected" });
  });
});

describe("redirectMessage", () => {
  it("returns null with no param", () => {
    expect(redirectMessage(undefined, undefined)).toBeNull();
  });
  it("maps every xero= code", () => {
    for (const code of ["error", "disconnected", "disconnected-local", "setup-complete"]) {
      expect(redirectMessage(code, undefined)?.text).toBeTruthy();
    }
  });
  it("uses the spec 5.5 wording for disconnected-local", () => {
    expect(redirectMessage("disconnected-local", undefined)?.text).toBe(
      "Disconnected in Manuva; remove Manuva in Xero → Connected apps if it still appears."
    );
  });
  it("appends a specific, non-generic reason for every reason code", () => {
    const generic = redirectMessage("error", "nope-unknown")?.text;
    for (const r of ALL_REASONS) {
      const text = redirectMessage("error", r)?.text ?? "";
      expect(text.length).toBeGreaterThan((redirectMessage("error", undefined)?.text ?? "").length);
      expect(text).not.toBe(generic);
    }
  });
  it("falls back to a generic message for unknown codes", () => {
    expect(redirectMessage("whatever", undefined)).toEqual({ text: "Something went wrong with Xero. Try again.", error: true });
    expect(redirectMessage("error", "weird")?.text).toBe(redirectMessage("error", undefined)?.text);
  });
  it("flags success messages as non-errors", () => {
    expect(redirectMessage("setup-complete", undefined)?.error).toBe(false);
    expect(redirectMessage("disconnected", undefined)?.error).toBe(false);
  });
});
