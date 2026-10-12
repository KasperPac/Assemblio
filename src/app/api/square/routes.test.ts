import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignedState } from "@/lib/security/signed-state";

const mocks = vi.hoisted(() => ({ context: vi.fn(), cookie: vi.fn(), exchange: vi.fn(), save: vi.fn(), ingest: vi.fn(), process: vi.fn(), after: vi.fn(), audit: vi.fn(), db: {} }));
vi.mock("@/lib/tenant/context", () => ({ getServerTenantContext: mocks.context }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => mocks.db }));
vi.mock("@/lib/square/auth", () => ({ exchangeSquareCode: mocks.exchange }));
vi.mock("@/lib/square/connection", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/square/connection")>(), saveSquareConnection: mocks.save }));
vi.mock("@/lib/square/events", () => ({ processSquareWebhook: mocks.ingest, processDueSquareEvents: mocks.process }));
vi.mock("@/lib/activity/log", () => ({ logActivity: mocks.audit }));
import { GET as install } from "./install/route";
import { GET as callback } from "./callback/route";
import { POST as webhook } from "./webhook/route";

const base = "https://manuva.example";
const tenantId = "Pac-Technologies", userId = "test-admin", nonce = "test-nonce", secret = "test-only-application-secret";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SQUARE_APPLICATION_ID", "test-app");
  vi.stubEnv("SQUARE_APPLICATION_SECRET", secret);
  vi.stubEnv("SQUARE_REDIRECT_URI", `${base}/api/square/callback`);
  vi.stubEnv("SQUARE_TOKEN_KEY", Buffer.alloc(32, 1).toString("base64"));
  vi.stubEnv("SQUARE_ENVIRONMENT", "production");
  vi.stubEnv("SQUARE_PILOT_TENANTS", tenantId);
  vi.stubEnv("SQUARE_WEBHOOK_SIGNATURE_KEY", "test-only-webhook-key");
  vi.stubEnv("SQUARE_WEBHOOK_URL", `${base}/api/square/webhook`);
  mocks.context.mockResolvedValue({ tenantId, userId, role: "admin" });
  mocks.cookie.mockReturnValue({ value: nonce });
  mocks.exchange.mockResolvedValue({ ok: true, data: { accessToken: "test-only-access", refreshToken: "test-only-refresh", merchantId: "test-merchant", expiresAt: new Date(Date.now() + 86_400_000).toISOString() } });
  mocks.save.mockResolvedValue("test-connection");
  mocks.ingest.mockResolvedValue({ stored: true });
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
const callbackRequest = (state = createSignedState({ tenantId, userId, nonce }, secret, 300_000)) => new Request(`${base}/api/square/callback?${new URLSearchParams({ code: "test-code", state })}`);
const webhookRequest = (body: string, signature?: string) => new Request(`${base}/api/square/webhook`, { method: "POST", headers: { "x-square-hmacsha256-signature": signature ?? createHmac("sha256", "test-only-webhook-key").update(`${base}/api/square/webhook` + body).digest("base64") }, body });

describe("Square OAuth routes", () => {
  it("denies member/observer and unallowlisted install before OAuth", async () => {
    for (const role of ["member", "platform_observer"]) {
      mocks.context.mockResolvedValue({ tenantId, userId, role });
      expect((await install(new Request(`${base}/api/square/install`))).headers.get("location")).toContain("reason=not-admin");
    }
    mocks.context.mockResolvedValue({ tenantId: "other", userId, role: "admin" });
    expect((await install(new Request(`${base}/api/square/install`))).headers.get("location")).toContain("reason=not-available");
  });
  it("sets an HttpOnly nonce scoped to Square and sends signed state to Square", async () => {
    const res = await install(new Request(`${base}/api/square/install`));
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://connect.squareup.com");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(res.headers.get("set-cookie")).toContain("Path=/api/square");
  });
  it("rejects a switched tenant/user, used nonce and expired state without exchange or save", async () => {
    mocks.context.mockResolvedValue({ tenantId, userId: "other-admin", role: "admin" });
    expect((await callback(callbackRequest())).headers.get("location")).toContain("reason=session-mismatch");
    mocks.context.mockResolvedValue({ tenantId, userId, role: "admin" });
    mocks.cookie.mockReturnValue(undefined);
    expect((await callback(callbackRequest())).headers.get("location")).toContain("reason=bad-state");
    mocks.cookie.mockReturnValue({ value: nonce });
    const expired = createSignedState({ tenantId, userId, nonce }, secret, 1, Date.now() - 1000);
    const res = await callback(callbackRequest(expired));
    expect(res.headers.get("location")).toContain("reason=expired");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("persists only the session-bound tenant and clears the nonce on success", async () => {
    const res = await callback(callbackRequest());
    expect(res.headers.get("location")).toContain("square=connected");
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ tenantId, userId, environment: "production" });
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("never reports a failed credential save as connected or logs provider token failures", async () => {
    mocks.save.mockRejectedValue(new Error("private database detail"));
    expect((await callback(callbackRequest())).headers.get("location")).toContain("reason=save-failed");
    mocks.exchange.mockResolvedValue({ ok: false, status: 401, errorClass: "auth", code: "UNAUTHORIZED" });
    const res = await callback(callbackRequest());
    expect(res.headers.get("location")).toContain("reason=token-exchange");
    expect(res.headers.get("location")).not.toContain("private");
  });
});
describe("Square webhook route", () => {
  const body = JSON.stringify({ event_id: "test-event", merchant_id: "test-merchant", type: "order.updated" });
  it("rejects unsigned/tampered events before persistence or processing", async () => {
    expect((await webhook(webhookRequest(body, "bad"))).status).toBe(401);
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("requires complete event identity and valid JSON", async () => {
    for (const invalid of ["{invalid", "null", JSON.stringify({ event_id: "test-event" })]) expect((await webhook(webhookRequest(invalid))).status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("returns retryable failure for durable ingest failure", async () => {
    mocks.ingest.mockRejectedValue(new Error("database unavailable"));
    expect((await webhook(webhookRequest(body))).status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("acknowledges persisted events then registers processing; unknown merchants do not process", async () => {
    expect((await webhook(webhookRequest(body))).status).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledWith(mocks.db, JSON.parse(body));
    expect(mocks.after).toHaveBeenCalledTimes(1);
    mocks.after.mockClear();
    mocks.ingest.mockResolvedValue({ stored: false });
    expect((await webhook(webhookRequest(body))).status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
