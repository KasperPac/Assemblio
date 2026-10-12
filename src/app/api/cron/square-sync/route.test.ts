import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ factory: vi.fn(), from: vi.fn(), events: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.factory }));
vi.mock("@/lib/square/events", () => ({ processDueSquareEvents: mocks.events }));
vi.mock("@/lib/square/sync", () => ({ syncSquareTenant: mocks.sync }));
import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-only-cron-secret");
  vi.stubEnv("SQUARE_PILOT_TENANTS", "Pac-Technologies");
  const data = [
    { id: "test-connection", tenant_id: "Pac-Technologies", sales_channel_id: "test-channel", status: "active", environment: "production" },
    { id: "other-connection", tenant_id: "other-tenant", sales_channel_id: "other-channel", status: "active", environment: "production" },
  ];
  const query = { select: () => query, eq: () => query, order: () => query, range: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  mocks.from.mockReturnValue(query);
  mocks.factory.mockReturnValue({ from: mocks.from });
  mocks.events.mockResolvedValue({ processed: 0, failed: 0 });
  mocks.sync.mockResolvedValue({ orders: 1, locations: 1 });
});
afterEach(() => vi.unstubAllEnvs());
const request = (authorization?: string) => new Request("https://manuva.example/api/cron/square-sync", { headers: authorization ? { authorization } : {} });
describe("Square scheduled reconciliation", () => {
  it("denies unsigned, wrong and missing-config requests before any database or provider work", async () => {
    for (const auth of [undefined, "Bearer wrong", "test-only-cron-secret"]) expect((await GET(request(auth))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(request("Bearer test-only-cron-secret"))).status).toBe(401);
    expect(mocks.factory).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("processes durable events and reconciles only explicitly allowlisted tenants", async () => {
    const res = await POST(request("Bearer test-only-cron-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ synced: 1, failed: 0 });
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.sync.mock.calls[0][1]).toMatchObject({ tenant_id: "Pac-Technologies" });
    expect(mocks.events).toHaveBeenCalledTimes(1);
  });
  it("returns retryable failure for incomplete event/provider work without leaking details", async () => {
    mocks.events.mockResolvedValue({ processed: 0, failed: 1 });
    mocks.sync.mockRejectedValue(new Error("test-only-private-access-token"));
    const res = await GET(request("Bearer test-only-cron-secret"));
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain('"failed":2');
    expect(body).not.toContain("private-access-token");
  });
});
