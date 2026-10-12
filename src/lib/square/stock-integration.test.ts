import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => vi.fn());
vi.mock("./client", async (importOriginal) => ({ ...await importOriginal<typeof import("./client")>(), squareFetch: provider }));
import { pushSquareStock } from "./stock";

type Row = Record<string, unknown>;
const connection = { id: "test-connection", tenant_id: "Pac-Technologies", sales_channel_id: "test-channel", merchant_id: "test-merchant", environment: "production" as const, status: "active" as const };
const now = Date.parse("2026-10-12T00:00:00Z");
const access = () => ({ baseUrl: "https://connect.squareup.com", accessToken: "test-only-access-token", deadline: Date.now() + 35_000, leaseToken: "test-sync-lease" });
function stockDb(options: { onHand?: number; reserved?: number; staleLease?: boolean; claimLost?: boolean; failTable?: string; deadlineDuringDb?: boolean; finalLeaseExpiry?: string | null; notificationDuringDb?: boolean } = {}) {
  const tenant = { tenant_id: connection.tenant_id };
  const tables: Record<string, Row[]> = {
    square_order_line: [], square_webhook_event: [],
    channel_item_link: [{ ...tenant, id: "test-item-link", sales_channel_id: "test-channel", variant_id: "test-variant", external_variation_id: "test-square-variation", status: "linked", stock_conversion_ratio: null, tracked_location_ids: ["test-square-location"] }],
    square_location_link: [{ ...tenant, sales_channel_id: "test-channel", square_location_id: "test-square-location", location_id: "test-location" }],
    sales_channel: [{ ...tenant, id: "test-channel", stock_write_enabled: true, baseline_confirmed_at: "2026-10-01T00:00:00Z", sync_lease_token: "test-sync-lease", sync_lease_until: new Date(now + 180_000).toISOString() }],
    product_bom: [{ ...tenant, id: "test-bom", variant_id: "test-variant", is_active: true }],
    product_bom_component: [{ ...tenant, product_bom_id: "test-bom", component_id: "test-component", quantity: 1 }],
    inventory_balance: [{ ...tenant, component_id: "test-component", location_id: "test-location", on_hand: options.onHand ?? 12, reserved: options.reserved ?? 3 }],
    channel_stock_write: [],
  };
  let channelReads = 0;
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let mutation: Row | undefined, inserted: Row | undefined, descending = false, start = 0, end = Infinity;
    const field = (row: Row, key: string) => key.split(".").reduce<unknown>((value, part) => (value as Row | null)?.[part], row);
    const resolve = () => {
      if (options.failTable === table) return { data: null, error: { message: "test database unavailable" } };
      if (inserted) tables[table].push({ id: "test-idempotency-key", status: "pending", attempts: 0, lease_until: null, created_at: new Date(now).toISOString(), ...inserted });
      let rows = tables[table].filter((row) => filters.every((predicate) => predicate(row)));
      if (table === "sales_channel" && !mutation) {
        channelReads++;
        if (channelReads === 2 && options.staleLease) rows = rows.map((row) => ({ ...row, sync_lease_token: "successor-lease" }));
        if (channelReads === 2 && options.finalLeaseExpiry !== undefined) rows = rows.map((row) => ({ ...row, sync_lease_until: options.finalLeaseExpiry }));
        if (channelReads === 2 && options.deadlineDuringDb) vi.setSystemTime(now + 40_000);
      }
      if (table === "inventory_balance" && options.notificationDuringDb) tables.square_webhook_event.push({ id: "new-notification", tenant_id: connection.tenant_id, sales_channel_id: connection.sales_channel_id, event_type: "order.updated", status: "pending" });
      if (mutation?.status === "processing" && options.claimLost) rows = [];
      if (mutation) for (const row of rows) Object.assign(row, mutation);
      if (descending) rows = [...rows].reverse();
      return { data: rows.slice(start, end + 1).map((row) => ({ ...row })), error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => field(row, key) === value); return query; },
      neq: (key: string, value: unknown) => { filters.push((row) => field(row, key) !== value); return query; },
      is: (key: string, value: unknown) => { filters.push((row) => field(row, key) === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(field(row, key))); return query; },
      order: (_key: string, order?: { ascending?: boolean }) => { descending = order?.ascending === false; return query; },
      range: (first: number, last: number) => { start = first; end = last; return query; },
      limit: (limit: number) => { end = limit - 1; return query; },
      insert: (row: Row) => { inserted = row; return query; },
      update: (row: Row) => { mutation = row; return query; },
      single: async () => { const result = resolve(); return { ...result, data: result.data?.[0] ?? null }; },
      maybeSingle: async () => { const result = resolve(); return { ...result, data: result.data?.[0] ?? null }; },
      then: (resolvePromise: (value: unknown) => unknown) => Promise.resolve(resolve()).then(resolvePromise),
    };
    return query;
  };
  return { db: { from } as unknown as SupabaseClient, tables };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  provider.mockResolvedValue({ ok: true, data: { counts: [{ catalog_object_id: "test-square-variation", location_id: "test-square-location", quantity: "9", calculated_at: new Date(now).toISOString() }] } });
});
afterEach(() => vi.useRealTimers());
describe("Square outbound stock business contract", () => {
  it("exports available stock, preserving the Manuva balance and recording the exact Square echo proof", async () => {
    const f = stockDb();
    await pushSquareStock(f.db, connection, access());
    expect(provider).toHaveBeenCalledTimes(1);
    const [credentials, path, request] = provider.mock.calls[0];
    expect(credentials.baseUrl).toBe("https://connect.squareup.com");
    expect(path).toBe("/v2/inventory/changes/batch-create");
    expect(request.body.changes[0].physical_count).toMatchObject({ catalog_object_id: "test-square-variation", location_id: "test-square-location", state: "IN_STOCK", quantity: "9" });
    expect(f.tables.inventory_balance[0]).toMatchObject({ on_hand: 12, reserved: 3 });
    expect(f.tables.channel_stock_write[0]).toMatchObject({ quantity: 9, status: "sent", square_calculated_at: new Date(now).toISOString() });
  });
  it("clamps oversubscribed or negative stock to zero at the provider boundary", async () => {
    for (const onHand of [2, -5]) {
      provider.mockClear();
      await pushSquareStock(stockDb({ onHand, reserved: 3 }).db, connection, access());
      expect(provider.mock.calls[0][2].body.changes[0].physical_count.quantity).toBe("0");
    }
  });
  it("blocks unresolved live sales but allows unresolved historical lines after a confirmed baseline", async () => {
    const f = stockDb();
    const pending = { id: "test-pending-line", tenant_id: connection.tenant_id, sales_channel_id: connection.sales_channel_id, status: "pending_mapping", orders: { historical: false } };
    f.tables.square_order_line.push(pending);
    await pushSquareStock(f.db, connection, access());
    expect(provider).not.toHaveBeenCalled();
    pending.orders.historical = true;
    await pushSquareStock(f.db, connection, access());
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("blocks outbound changes while a newer inventory/order notification has not reconciled", async () => {
    const f = stockDb();
    f.tables.square_webhook_event.push({ id: "test-event", tenant_id: connection.tenant_id, sales_channel_id: connection.sales_channel_id, event_type: "inventory.count.updated", status: "pending" });
    await pushSquareStock(f.db, connection, access());
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not contact Square after lease ownership changes or database work exhausts the deadline", async () => {
    for (const options of [{ staleLease: true }, { deadlineDuringDb: true }]) {
      vi.setSystemTime(now); provider.mockClear();
      await expect(pushSquareStock(stockDb(options).db, connection, access())).rejects.toThrow();
      expect(provider).not.toHaveBeenCalled();
    }
  });
  it("fails closed for a null, malformed or expired lease at the final provider boundary", async () => {
    for (const finalLeaseExpiry of [null, "invalid", new Date(now - 1).toISOString()]) {
      await expect(pushSquareStock(stockDb({ finalLeaseExpiry }).db, connection, access())).rejects.toThrow();
      expect(provider).not.toHaveBeenCalled();
    }
  });
  it("defers a physical-count write when a new sale notification arrives during database reads", async () => {
    await expect(pushSquareStock(stockDb({ notificationDuringDb: true }).db, connection, access())).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not contact Square on a failed Supabase read or a lost stock-write claim", async () => {
    for (const options of [{ failTable: "inventory_balance" }, { claimLost: true }]) {
      await expect(pushSquareStock(stockDb(options).db, connection, access())).rejects.toThrow();
      expect(provider).not.toHaveBeenCalled();
    }
  });
  it("retries an uncertain request with the same idempotency key and physical-count timestamp", async () => {
    const f = stockDb();
    provider.mockResolvedValueOnce({ ok: false, status: 0, errorClass: "transient", code: "network_error" });
    await expect(pushSquareStock(f.db, connection, access())).rejects.toThrow();
    const firstBody = provider.mock.calls[0][2].body;
    vi.setSystemTime(now + 61_000);
    await pushSquareStock(f.db, connection, access());
    expect(provider.mock.calls[1][2].body).toEqual(firstBody);
    expect(f.tables.channel_stock_write).toHaveLength(1);
    expect(f.tables.channel_stock_write[0]).toMatchObject({ status: "sent", attempts: 2 });
  });
});
