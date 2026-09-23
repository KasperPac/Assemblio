import { beforeEach, describe, expect, it } from "vitest";
import { signPendingInstall } from "@/lib/shopify/pending-install";
import { signLinkHandoff } from "@/lib/shopify/link-handoff";
import { resolveLinkSource } from "./link-source";

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = "test-shopify-api-secret";
});

describe("resolveLinkSource", () => {
  it("returns the cookie install, with its access token, when present", () => {
    const cookie = signPendingInstall("acme.myshopify.com", "tok-123", "read_orders,read_products");
    expect(resolveLinkSource(cookie, null)).toEqual({
      mode: "pending",
      shop: "acme.myshopify.com",
      accessToken: "tok-123",
      scopes: "read_orders,read_products",
      refreshToken: null,
      expiresInSeconds: null,
    });
  });

  it("returns a handoff, with no access token, when only the param is present", () => {
    const handoff = signLinkHandoff("acme.myshopify.com");
    expect(resolveLinkSource("", handoff)).toEqual({
      mode: "handoff",
      shop: "acme.myshopify.com",
    });
  });

  it("prefers the cookie when both are present — it carries a token, the handoff does not", () => {
    const cookie = signPendingInstall("acme.myshopify.com", "tok-123", "read_orders");
    const handoff = signLinkHandoff("other.myshopify.com");
    const source = resolveLinkSource(cookie, handoff);
    expect(source?.mode).toBe("pending");
    expect(source?.shop).toBe("acme.myshopify.com");
  });

  it("falls back to the handoff when the cookie is invalid", () => {
    const handoff = signLinkHandoff("acme.myshopify.com");
    expect(resolveLinkSource("garbage.deadbeef", handoff)).toEqual({
      mode: "handoff",
      shop: "acme.myshopify.com",
    });
  });

  it("returns null when neither is usable", () => {
    expect(resolveLinkSource("", null)).toBeNull();
    expect(resolveLinkSource("garbage.deadbeef", "also-garbage.deadbeef")).toBeNull();
  });
});
