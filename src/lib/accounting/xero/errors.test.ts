import { describe, expect, it } from "vitest";
import type { RateInfo } from "./client";
import { classifyXeroFailure, toUserMessage, xeroValidationMessages } from "./errors";

const rate: RateInfo = { minRemaining: null, dayRemaining: null, retryAfterSec: null, problem: null };
const fail = (status: number, body: unknown = null, r = rate) => ({ ok: false as const, status, body, rate: r });

describe("classifyXeroFailure", () => {
  it("network and 5xx are transient", () => {
    expect(classifyXeroFailure({ ...fail(0), networkError: "x" }).errorClass).toBe("transient");
    expect(classifyXeroFailure(fail(503)).errorClass).toBe("transient");
  });
  it("429 minute is transient with retry-after; 429 day is daily_limit", () => {
    expect(classifyXeroFailure(fail(429, null, { ...rate, retryAfterSec: 30, problem: "minute" }))).toMatchObject({ errorClass: "transient", retryAfterSec: 30 });
    expect(classifyXeroFailure(fail(429, null, { ...rate, retryAfterSec: 3600, problem: "day" }))).toMatchObject({ errorClass: "daily_limit", retryAfterSec: 3600 });
  });
  it("401 and 403 are auth", () => {
    expect(classifyXeroFailure(fail(401)).errorClass).toBe("auth");
    expect(classifyXeroFailure(fail(403)).errorClass).toBe("auth");
  });
  it("400 validation is fixable with a catalogue message", () => {
    const body = { Elements: [{ ValidationErrors: [{ Message: "Account code '300' is not a valid code for this document." }] }] };
    const c = classifyXeroFailure(fail(400, body));
    expect(c.errorClass).toBe("fixable");
    expect(c.message).toMatch(/account on this bill is archived or missing/);
  });
  it("unknown validation text is passed through", () => {
    const c = classifyXeroFailure(fail(400, { Elements: [{ ValidationErrors: [{ Message: "Something odd" }] }] }));
    expect(c.message).toBe("Xero rejected this: Something odd");
  });
});

describe("catalogue", () => {
  it.each([
    ["The TaxType code 'INPUT' cannot be used with account code '630'.", /tax rate on this bill/],
    ["The contact is archived and cannot be used.", /contact is archived/],
    ["The document date cannot be before the period lock date of 30 Jun 2026.", /locked for this invoice date/],
    ["Invoice # must be unique.", /already has a bill with this invoice number/],
    ["The contact name Acme Ltd is already assigned to another contact.", /already exists in Xero/],
  ])("maps %s", (msg, re) => {
    expect(toUserMessage(msg)).toMatch(re);
  });
  it("collects nested messages once", () => {
    expect(xeroValidationMessages({ Elements: [{ ValidationErrors: [{ Message: "A" }, { Message: "A" }], LineItems: [{ ValidationErrors: [{ Message: "B" }] }] }] })).toEqual(["A", "B"]);
  });
});
