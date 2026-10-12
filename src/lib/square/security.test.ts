import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSignedState } from "@/lib/security/signed-state";
import { buildSquareAuthorizeUrl, getSquareConfig, isSquarePilotTenant } from "./config";
import { validateSquareCallback } from "./connection";
import { verifySquareWebhookSignature } from "./webhook-signature";

const tenantId = "Pac-Technologies";
const env = { SQUARE_APPLICATION_ID: "test-application", SQUARE_APPLICATION_SECRET: "test-only-signing-secret", SQUARE_REDIRECT_URI: "https://manuva.example/api/square/callback", SQUARE_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64") };
describe("Square rollout and configuration", () => {
  it("fails closed for missing/invalid encryption configuration", () => {
    expect(getSquareConfig({})).toMatchObject({ ok: false });
    expect(getSquareConfig({ ...env, SQUARE_TOKEN_KEY: "bad" })).toMatchObject({ ok: false, missing: ["SQUARE_TOKEN_KEY"] });
  });
  it("rejects production HTTP, unknown environments, and credential-bearing redirect URLs", () => {
    for (const override of [{ SQUARE_REDIRECT_URI: "http://localhost/api/square/callback" }, { SQUARE_ENVIRONMENT: "staging" }, { SQUARE_REDIRECT_URI: "https://user:pass@manuva.example/api/square/callback" }]) expect(getSquareConfig({ ...env, ...override }).ok).toBe(false);
    expect(getSquareConfig({ ...env, SQUARE_ENVIRONMENT: "sandbox", SQUARE_REDIRECT_URI: "http://localhost/api/square/callback" }).ok).toBe(false);
    expect(getSquareConfig({ ...env, SQUARE_ENVIRONMENT: "sandbox", SQUARE_REDIRECT_URI: "https://localhost/api/square/callback" }).ok).toBe(true);
  });
  it("requires an explicit tenant allowlist and never accepts wildcard", () => {
    expect(isSquarePilotTenant(tenantId, {})).toBe(false);
    expect(isSquarePilotTenant(tenantId, { SQUARE_PILOT_TENANTS: "*" })).toBe(false);
    expect(isSquarePilotTenant(tenantId, { SQUARE_PILOT_TENANTS: `other, ${tenantId}` })).toBe(true);
    expect(isSquarePilotTenant(null, { SQUARE_PILOT_TENANTS: tenantId })).toBe(false);
  });
  it("requests no payments or catalog write permissions", () => {
    const cfg = getSquareConfig(env);
    if (!cfg.ok) throw new Error("fixture configuration");
    const url = new URL(buildSquareAuthorizeUrl(cfg, "signed-state"));
    expect(url.origin).toBe("https://connect.squareup.com");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toBe("ITEMS_READ INVENTORY_READ INVENTORY_WRITE ORDERS_READ MERCHANT_PROFILE_READ");
  });
});
describe("Square callback binding", () => {
  const secret = "test-only-signing-secret";
  const fields = { tenantId, userId: "test-admin", nonce: "test-nonce" };
  const input = { error: null, code: "test-code", state: createSignedState(fields, secret, 1000, 100), nonceCookie: fields.nonce, session: { tenantId, userId: fields.userId, role: "admin" }, secret, now: 101 };
  it("accepts the initiating admin or super admin session", () => {
    expect(validateSquareCallback(input)).toEqual({ ok: true, tenantId, userId: "test-admin" });
    expect(validateSquareCallback({ ...input, session: { ...input.session, role: "super_admin" } }).ok).toBe(true);
  });
  it("rejects tenant switching, user switching, missing nonce and read-only users", () => {
    expect(validateSquareCallback({ ...input, session: { ...input.session, tenantId: "other" } })).toMatchObject({ ok: false, reason: "session-mismatch" });
    expect(validateSquareCallback({ ...input, session: { ...input.session, userId: "other" } })).toMatchObject({ ok: false, reason: "session-mismatch" });
    expect(validateSquareCallback({ ...input, nonceCookie: null }).ok).toBe(false);
    expect(validateSquareCallback({ ...input, nonceCookie: "other" })).toMatchObject({ ok: false, reason: "nonce-mismatch" });
    expect(validateSquareCallback({ ...input, session: { ...input.session, role: "platform_observer" } })).toMatchObject({ ok: false, reason: "not-admin" });
  });
  it("rejects expired/tampered state and safely classifies untrusted error strings", () => {
    expect(validateSquareCallback({ ...input, now: 1100 })).toMatchObject({ ok: false, reason: "expired" });
    expect(validateSquareCallback({ ...input, state: input.state + "x" }).ok).toBe(false);
    expect(validateSquareCallback({ ...input, error: "secret-looking-provider-error" })).toEqual({ ok: false, reason: "square-error" });
  });
});
describe("Square webhook verification", () => {
  const key = "test-only-webhook-key", url = "https://manuva.example/api/square/webhook", body = '{ "event_id": "test-event", "merchant_id": "test-merchant" }';
  const signature = createHmac("sha256", key).update(url + body).digest("base64");
  it("accepts exact bytes and rejects body, URL, key or signature changes", () => {
    expect(verifySquareWebhookSignature(body, signature, key, url)).toBe(true);
    expect(verifySquareWebhookSignature(JSON.stringify(JSON.parse(body)), signature, key, url)).toBe(false);
    expect(verifySquareWebhookSignature(body, signature, key, url + "/")).toBe(false);
    expect(verifySquareWebhookSignature(body, signature, "other", url)).toBe(false);
    for (const invalid of [null, "", signature + "x", "A".repeat(44)]) expect(verifySquareWebhookSignature(body, invalid, key, url)).toBe(false);
  });
});
