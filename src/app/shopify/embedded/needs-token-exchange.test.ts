import { describe, expect, it } from "vitest";
import { needsTokenExchange } from "./needs-token-exchange";

describe("needsTokenExchange", () => {
  it("is true when the shop has no store row (not-installed)", () => {
    expect(needsTokenExchange({ status: "not-installed" })).toBe(true);
  });

  it("is true when the shop is associated but has no stored token", () => {
    expect(needsTokenExchange({ status: "ok", hasToken: false })).toBe(true);
    expect(needsTokenExchange({ status: "no-subscription", hasToken: false })).toBe(true);
    expect(needsTokenExchange({ status: "past_due_locked", hasToken: false })).toBe(true);
  });

  it("is false when the shop already has a stored token", () => {
    expect(needsTokenExchange({ status: "ok", hasToken: true })).toBe(false);
    expect(needsTokenExchange({ status: "no-subscription", hasToken: true })).toBe(false);
  });
});
