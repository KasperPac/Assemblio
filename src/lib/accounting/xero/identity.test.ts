import { describe, expect, it, vi } from "vitest";
import { exchangeCode, organisationsForEvent, readAuthEventId, refreshTokens, listConnections, deleteConnection } from "./identity";

const cfg = { ok: true as const, clientId: "cid", clientSecret: "sec", redirectUri: "https://app.manuva.app/api/xero/callback" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

describe("identity", () => {
  it("exchanges a code with basic auth and form body", async () => {
    const f = vi.fn().mockResolvedValue(json(200, { access_token: "a", refresh_token: "r", expires_in: 1800 }));
    const r = await exchangeCode(cfg, "the-code", f);
    expect(r).toEqual({ ok: true, tokens: { accessToken: "a", refreshToken: "r", expiresInSec: 1800 } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://identity.xero.com/connect/token");
    expect(init.headers.Authorization).toBe("Basic " + Buffer.from("cid:sec").toString("base64"));
    expect(new URLSearchParams(init.body).get("grant_type")).toBe("authorization_code");
    expect(new URLSearchParams(init.body).get("redirect_uri")).toBe(cfg.redirectUri);
  });

  it("surfaces invalid_grant on refresh", async () => {
    const f = vi.fn().mockResolvedValue(json(400, { error: "invalid_grant" }));
    expect(await refreshTokens(cfg, "old", f)).toEqual({ ok: false, status: 400, error: "invalid_grant" });
  });

  it("maps a network failure to status 0", async () => {
    const f = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await refreshTokens(cfg, "old", f)).toEqual({ ok: false, status: 0, error: "network_error" });
  });

  it("reads authentication_event_id from the access token", () => {
    expect(readAuthEventId(jwt({ authentication_event_id: "evt-1" }))).toBe("evt-1");
    expect(readAuthEventId("not-a-jwt")).toBeNull();
  });

  it("keeps only organisations from this consent", () => {
    const conns = [
      { id: "c1", tenantId: "o1", tenantName: "A", tenantType: "ORGANISATION", authEventId: "evt-1" },
      { id: "c2", tenantId: "o2", tenantName: "B", tenantType: "ORGANISATION", authEventId: "evt-0" },
      { id: "c3", tenantId: "p1", tenantName: "Practice", tenantType: "PRACTICE", authEventId: "evt-1" },
    ];
    expect(organisationsForEvent(conns, "evt-1").map((c) => c.id)).toEqual(["c1"]);
    expect(organisationsForEvent(conns, null)).toEqual([]);
  });

  it("lists connections and treats 404 on delete as done", async () => {
    const f = vi.fn().mockResolvedValueOnce(json(200, [{ id: "c1", tenantId: "o1", tenantName: "A", tenantType: "ORGANISATION", authEventId: "e" }])).mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await listConnections("tok", f))[0].tenantId).toBe("o1");
    expect(await deleteConnection("tok", "c1", f)).toBe(true);
  });
});
