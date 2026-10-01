import { describe, expect, it, vi } from "vitest";
import { parseRateHeaders, xeroRequest } from "./client";

const access = { accessToken: "tok", xeroTenantId: "org-1" };

describe("xeroRequest", () => {
  it("sends auth, tenant, idempotency and query", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Invoices: [] }), { status: 200, headers: { "x-minlimit-remaining": "59" } }));
    const r = await xeroRequest(access, { method: "POST", path: "/Invoices", query: { unitdp: "4" }, body: { a: 1 }, idempotencyKey: "si-1-create" }, f);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.xero.com/api.xro/2.0/Invoices?unitdp=4");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["xero-tenant-id"]).toBe("org-1");
    expect(init.headers["Idempotency-Key"]).toBe("si-1-create");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(r.rate.minRemaining).toBe(59);
  });

  it("returns a failure with scrubbed body instead of throwing", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Message: "bad", access_token: "leak" }), { status: 400 }));
    const r = await xeroRequest(access, { method: "GET", path: "/Accounts" }, f);
    expect(r).toMatchObject({ ok: false, status: 400, body: { Message: "bad", access_token: "[redacted]" } });
  });

  it("maps network errors to status 0", async () => {
    const f = vi.fn().mockRejectedValue(new Error("socket hang up Bearer abc"));
    const r = await xeroRequest(access, { method: "GET", path: "/Accounts" }, f);
    expect(r).toMatchObject({ ok: false, status: 0, networkError: "socket hang up Bearer [redacted]" });
  });

  it("parses rate headers", () => {
    const h = new Headers({ "retry-after": "42", "x-rate-limit-problem": "day", "x-daylimit-remaining": "0" });
    expect(parseRateHeaders(h)).toEqual({ minRemaining: null, dayRemaining: 0, retryAfterSec: 42, problem: "day" });
  });
});
