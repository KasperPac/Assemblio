import { describe, expect, it, beforeAll, vi } from "vitest";
import { signPendingInstall, verifyPendingInstall } from "./pending-install";

beforeAll(() => {
  process.env.SHOPIFY_API_SECRET = "test-secret-32-chars-long-abcdef";
});

describe("signPendingInstall / verifyPendingInstall", () => {
  it("round-trips a valid pending install", () => {
    const cookie = signPendingInstall("mystore.myshopify.com", "tok_abc123", "read_orders,write_orders");
    const result = verifyPendingInstall(cookie);
    expect(result).toEqual({
      shop: "mystore.myshopify.com",
      accessToken: "tok_abc123",
      scopes: "read_orders,write_orders",
    });
  });

  it("returns null for a tampered cookie", () => {
    const cookie = signPendingInstall("mystore.myshopify.com", "tok_abc123", "read_orders");
    const tampered = cookie.slice(0, -4) + "xxxx";
    expect(verifyPendingInstall(tampered)).toBeNull();
  });

  it("returns null for a malformed cookie (no dot)", () => {
    expect(verifyPendingInstall("nodothere")).toBeNull();
  });

  it("returns null for an expired cookie", () => {
    const cookie = signPendingInstall("mystore.myshopify.com", "tok_abc", "");
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 11 * 60 * 1000);
    const result = verifyPendingInstall(cookie);
    vi.restoreAllMocks();
    expect(result).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyPendingInstall("")).toBeNull();
  });
});
