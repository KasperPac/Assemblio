import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mockSync = vi.hoisted(() => vi.fn());
vi.mock("./sync", async (importOriginal) => ({ ...await importOriginal<typeof import("./sync")>(), syncSquareTenant: mockSync }));
import { processDueSquareEvents, processSquareWebhook } from "./events";
import { squarePages, requestSquare } from "./sync";

type Row = Record<string, unknown>;
function memoryDb() {
  const tables: Record<string, Row[]> = { square_connection: [{ id: "test-connection", tenant_id: "Pac-Technologies", sales_channel_id: "test-channel", merchant_id: "test-merchant", environment: "production", status: "active" }], square_webhook_event: [] };
  let failInsert = false;
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  const from = (name: string) => {
    const filters: Array<[string, unknown]> = [];
    let update: Row | undefined, insert: Row | undefined;
    const resolve = () => {
      if (insert) {
        if (failInsert) return { data: null, error: { message: "test durable store unavailable" } };
        if (!tables[name].some((row) => row.event_id === insert!.event_id)) tables[name].push({ ...insert });
        return { data: null, error: null };
      }
      const rows = (tables[name] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
      if (update) for (const row of rows) Object.assign(row, update);
      return { data: rows, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      upsert: (row: Row) => { insert = row; return query; },
      update: (row: Row) => { update = row; return query; },
      maybeSingle: async () => { const result = resolve(); return { ...result, data: result.data?.[0] ?? null }; },
      then: (resolvePromise: (value: unknown) => unknown) => Promise.resolve(resolve()).then(resolvePromise),
    };
    return query;
  };
  return { db: { from, rpc } as unknown as SupabaseClient, tables, rpc, failInsert: () => { failInsert = true; } };
}
beforeEach(() => {
  vi.clearAllMocks(); mockSync.mockResolvedValue({ orders: 1, locations: 1 });
  for (const [name, value] of Object.entries({ SQUARE_APPLICATION_ID: "test-app", SQUARE_APPLICATION_SECRET: "test-only-application-secret", SQUARE_REDIRECT_URI: "https://manuva.example/api/square/callback", SQUARE_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64"), SQUARE_ENVIRONMENT: "production", SQUARE_PILOT_TENANTS: "Pac-Technologies" })) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());
describe("Square durable event routing", () => {
  const event = { event_id: "test-event", merchant_id: "test-merchant", type: "order.updated", data: { customer_email: "private@example.invalid", payment: "private-payment" } };
  it("deduplicates delivery and persists only routing metadata bound to the merchant's environment", async () => {
    const f = memoryDb();
    f.tables.square_connection.push({ ...f.tables.square_connection[0], id: "sandbox-connection", environment: "sandbox", tenant_id: "other-tenant" });
    await processSquareWebhook(f.db, event);
    f.tables.square_webhook_event[0].status = "processed";
    await processSquareWebhook(f.db, event);
    expect(f.tables.square_webhook_event).toHaveLength(1);
    expect(f.tables.square_webhook_event[0]).toMatchObject({ tenant_id: "Pac-Technologies", sales_channel_id: "test-channel", status: "processed", payload: { event_id: "test-event", merchant_id: "test-merchant", type: "order.updated" } });
    expect(JSON.stringify(f.tables.square_webhook_event)).not.toContain("private");
    expect(mockSync).not.toHaveBeenCalled();
  });
  it("ignores unknown, disconnected and unallowlisted merchants without storing work", async () => {
    for (const mode of ["unknown", "disconnected", "unallowlisted"] as const) {
      const f = memoryDb();
      if (mode === "unknown") f.tables.square_connection[0].merchant_id = "other";
      if (mode === "disconnected") f.tables.square_connection[0].status = "disconnected";
      if (mode === "unallowlisted") f.tables.square_connection[0].tenant_id = "other-tenant";
      expect(await processSquareWebhook(f.db, event)).toEqual({ stored: false });
      expect(f.tables.square_webhook_event).toEqual([]);
    }
  });
  it("fails when durable storage fails so the route can request redelivery", async () => {
    const f = memoryDb(); f.failInsert();
    await expect(processSquareWebhook(f.db, event)).rejects.toThrow();
  });
  it("marks failed reconciliation retryable, never processed, and contains no private error detail", async () => {
    const f = memoryDb();
    const row = { id: "test-row", tenant_id: "Pac-Technologies", sales_channel_id: "test-channel", event_type: "order.updated", attempts: 1, lease_until: "2030-01-01T00:00:00Z", status: "processing" };
    f.tables.square_webhook_event.push({ ...row });
    f.rpc.mockResolvedValue({ data: [row], error: null });
    mockSync.mockRejectedValue(new Error("test-only-private-token"));
    expect(await processDueSquareEvents(f.db)).toEqual({ processed: 0, failed: 1 });
    expect(f.tables.square_webhook_event[0]).toMatchObject({ status: "failed" });
    expect(JSON.stringify(f.tables.square_webhook_event[0])).not.toContain("test-only-private-token");
  });
  it("does not overwrite a successor's lease with an old outcome", async () => {
    const f = memoryDb();
    const row = { id: "test-row", tenant_id: "Pac-Technologies", sales_channel_id: "test-channel", event_type: "order.updated", attempts: 1, lease_until: "2030-01-01T00:00:00Z", status: "processing" };
    f.tables.square_webhook_event.push({ ...row, lease_until: "2030-01-01T00:05:00Z" });
    f.rpc.mockResolvedValue({ data: [row], error: null });
    expect(await processDueSquareEvents(f.db)).toEqual({ processed: 0, failed: 0 });
    expect(f.tables.square_webhook_event[0]).toMatchObject({ status: "processing", lease_until: "2030-01-01T00:05:00Z" });
  });
  it("records OAuth revocation through the disconnect RPC without requesting seller API access", async () => {
    const f = memoryDb();
    const row = { id: "test-row", tenant_id: "Pac-Technologies", sales_channel_id: "test-channel", event_type: "oauth.authorization.revoked", attempts: 1, lease_until: "2030-01-01T00:00:00Z", status: "processing" };
    f.tables.square_webhook_event.push({ ...row });
    f.rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: null, error: null });
    expect(await processDueSquareEvents(f.db)).toEqual({ processed: 1, failed: 0 });
    expect(f.rpc).toHaveBeenLastCalledWith("square_disconnect", { p_tenant_id: "Pac-Technologies", p_connection_id: "test-connection" });
    expect(mockSync).not.toHaveBeenCalled();
  });
});
describe("Square complete pagination", () => {
  it("does not call the provider after the reconciliation deadline", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(requestSquare({ baseUrl: "https://connect.squareup.com", accessToken: "test-only-access", deadline: Date.now() - 1 }, "/v2/locations")).rejects.toThrow("time budget");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
  it("walks every page before returning the accumulated rows", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({ rows: ["first"], cursor: "page-2" }).mockResolvedValueOnce({ rows: ["second"] });
    expect(await squarePages(fetchPage)).toEqual(["first", "second"]);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, "page-2"]);
  });
  it("rejects cursor cycles and exhausted budgets rather than returning partial data", async () => {
    await expect(squarePages(async () => ({ rows: ["partial"], cursor: "same" }))).rejects.toThrow("repeated");
    let page = 0;
    await expect(squarePages(async () => ({ rows: ["partial"], cursor: String(++page) }), 2)).rejects.toThrow("page budget");
  });
});
