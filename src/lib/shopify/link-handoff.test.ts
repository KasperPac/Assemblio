import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { signLinkHandoff, verifyLinkHandoff, LINK_HANDOFF_TTL_MS } from "./link-handoff";

const SECRET = "test-shopify-api-secret";

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signLinkHandoff / verifyLinkHandoff", () => {
  it("round-trips the shop domain", () => {
    const handoff = signLinkHandoff("acme.myshopify.com");
    expect(verifyLinkHandoff(handoff)).toEqual({ shop: "acme.myshopify.com" });
  });

  it("carries no access token — the payload is shop and expiry only", () => {
    const handoff = signLinkHandoff("acme.myshopify.com");
    const encoded = handoff.slice(0, handoff.lastIndexOf("."));
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    expect(Object.keys(payload).sort()).toEqual(["exp", "shop"]);
  });

  it("rejects a tampered shop domain", () => {
    const handoff = signLinkHandoff("acme.myshopify.com");
    const forgedPayload = Buffer.from(
      JSON.stringify({ shop: "evil.myshopify.com", exp: Date.now() + 60_000 })
    ).toString("base64url");
    const sig = handoff.slice(handoff.lastIndexOf(".") + 1);
    expect(verifyLinkHandoff(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("rejects a handoff signed with a different secret", () => {
    const handoff = signLinkHandoff("acme.myshopify.com");
    process.env.SHOPIFY_API_SECRET = "a-different-secret";
    expect(verifyLinkHandoff(handoff)).toBeNull();
  });

  it("rejects an expired handoff", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    const handoff = signLinkHandoff("acme.myshopify.com");
    vi.setSystemTime(new Date(Date.now() + LINK_HANDOFF_TTL_MS + 1000));
    expect(verifyLinkHandoff(handoff)).toBeNull();
  });

  it("accepts a handoff just inside its TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    const handoff = signLinkHandoff("acme.myshopify.com");
    vi.setSystemTime(new Date(Date.now() + LINK_HANDOFF_TTL_MS - 1000));
    expect(verifyLinkHandoff(handoff)).toEqual({ shop: "acme.myshopify.com" });
  });

  it("returns null for malformed input", () => {
    expect(verifyLinkHandoff("")).toBeNull();
    expect(verifyLinkHandoff("no-dot")).toBeNull();
    expect(verifyLinkHandoff(".")).toBeNull();
    expect(verifyLinkHandoff("not-base64.deadbeef")).toBeNull();
  });

  it("rejects a payload whose shop is not a myshopify domain", () => {
    const payload = Buffer.from(
      JSON.stringify({ shop: "https://evil.example.com", exp: Date.now() + 60_000 })
    ).toString("base64url");
    const { createHmac } = require("crypto");
    const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifyLinkHandoff(`${payload}.${sig}`)).toBeNull();
  });
});
