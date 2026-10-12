import { describe, expect, it, vi } from "vitest";
import { squareFetch } from "./client";
import { exchangeSquareCode, refreshSquareTokens } from "./auth";
import { getSquareConfig } from "./config";

const access = { baseUrl: "https://connect.squareup.com", accessToken: "test-only-access-token" };
const cfg = getSquareConfig({ SQUARE_APPLICATION_ID: "test-app", SQUARE_APPLICATION_SECRET: "test-only-secret", SQUARE_REDIRECT_URI: "https://manuva.example/api/square/callback", SQUARE_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64") });
if (!cfg.ok) throw new Error("fixture configuration");
describe("Square API boundary", () => {
  it("pins version, disables redirects and sends bearer credentials only to Square", async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ locations: [] }));
    expect(await squareFetch(access, "/v2/locations", {}, mock)).toEqual({ ok: true, data: { locations: [] } });
    expect(mock.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { "Square-Version": "2026-09-16", Authorization: "Bearer test-only-access-token" } });
    for (const path of ["https://attacker.example", "//attacker.example", "/v2/../oauth2/token", "/v2/\\attacker"]) expect((await squareFetch(access, path, {}, mock)).ok).toBe(false);
    expect((await squareFetch({ ...access, baseUrl: "https://attacker.example" }, "/v2/locations", {}, mock)).ok).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("classifies failures without exposing arbitrary provider detail/code", async () => {
    for (const [status, errorClass] of [[401, "auth"], [429, "rate_limit"], [503, "transient"], [400, "validation"]] as const) {
      const result = await squareFetch(access, "/v2/locations", {}, vi.fn<typeof fetch>().mockResolvedValue(Response.json({ errors: [{ code: "test-secret-leak", detail: "test-secret-leak" }] }, { status })));
      expect(result).toEqual({ ok: false, status, errorClass, code: `http_${status}` });
      expect(JSON.stringify(result)).not.toContain("test-secret-leak");
    }
  });
  it("does not accept unreadable success or network exception as success", async () => {
    expect(await squareFetch(access, "/v2/locations", {}, vi.fn<typeof fetch>().mockResolvedValue(new Response("bad JSON")))).toMatchObject({ ok: false, code: "invalid_response" });
    expect(await squareFetch(access, "/v2/locations", {}, vi.fn<typeof fetch>().mockRejectedValue(new Error("test-only-secret")))).toMatchObject({ ok: false, code: "network_error" });
  });
});
describe("Square token exchange", () => {
  it("exchanges and refreshes through JSON OAuth requests with absolute expiry", async () => {
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const mock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: "test-only-access", refresh_token: "test-only-refresh", merchant_id: "test-merchant", expires_at: expiresAt }));
    expect(await exchangeSquareCode(cfg, "test-code", mock)).toEqual({ ok: true, data: { accessToken: "test-only-access", refreshToken: "test-only-refresh", merchantId: "test-merchant", expiresAt } });
    expect(JSON.parse(mock.mock.calls[0][1]!.body as string)).toMatchObject({ grant_type: "authorization_code", code: "test-code", redirect_uri: cfg.redirectUri });
    await refreshSquareTokens(cfg, "test-only-refresh", mock);
    expect(JSON.parse(mock.mock.calls[1][1]!.body as string)).toMatchObject({ grant_type: "refresh_token", refresh_token: "test-only-refresh", short_lived: false });
  });
  it("rejects partial, expired, malformed and empty token sets", async () => {
    const valid = { access_token: "test-only-access", refresh_token: "test-only-refresh", merchant_id: "test-merchant", expires_at: new Date(Date.now() + 86_400_000).toISOString() };
    for (const override of [{ access_token: "" }, { refresh_token: null }, { merchant_id: "" }, { expires_at: "yesterday" }, { expires_at: "2000-01-01T00:00:00Z" }]) {
      expect(await exchangeSquareCode(cfg, "test-code", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...valid, ...override })))).toMatchObject({ ok: false, code: "invalid_token_response" });
    }
  });
  it("recognises OAuth invalid_grant without retaining error descriptions", async () => {
    expect(await refreshSquareTokens(cfg, "test-only-refresh", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "invalid_grant", error_description: "private provider detail" }, { status: 400 })))).toEqual({ ok: false, status: 400, errorClass: "auth", code: "invalid_grant" });
  });
});
