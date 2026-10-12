import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), adminClient: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(),
  from: vi.fn(), pilot: vi.fn(), sync: vi.fn(),
}));
vi.mock("@/lib/tenant/authz", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.adminClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/square/config", () => ({ isSquarePilotTenant: mocks.pilot, getSquareConfig: () => ({ ok: false }) }));
vi.mock("@/lib/square/tokens", () => ({ getSquareAccess: vi.fn() }));
vi.mock("@/lib/square/auth", () => ({ revokeSquareToken: vi.fn() }));
vi.mock("@/lib/square/sync", () => ({ syncSquareTenant: mocks.sync }));
vi.mock("./data", () => ({ listSquareLocations: vi.fn() }));
import { saveSquareItem, setSquareStockWrites, syncSquareAction } from "./actions";

const tenantId = "00000000-0000-4000-8000-000000000001";
const conn = { id: "connection", tenant_id: tenantId, sales_channel_id: "channel", status: "active", merchant_id: "Pac-Technologies", environment: "sandbox" };
const db = { from: mocks.from, rpc: mocks.rpc };
function fd(values: Record<string, string>) { const form = new FormData(); for (const [k, v] of Object.entries(values)) form.set(k, v); return form; }
function queryResponse(result: unknown) {
  const chain: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)) };
  for (const method of ["select", "eq", "update", "insert"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ tenantId, userId: "admin", role: "admin" });
  mocks.adminClient.mockReturnValue(db);
  mocks.pilot.mockReturnValue(true);
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_square_sync" ? "lease-token" : true, error: null }));
  mocks.from.mockImplementation((table: string) => {
    const result = table === "square_connection" ? { data: conn, error: null } : { data: [], error: null };
    return queryResponse(result);
  });
});

describe("Square management gates", () => {
  it("refuses stock writes without opening count confirmation before any database write", async () => {
    const result = await setSquareStockWrites({}, fd({ enabled: "true" }));
    expect(result.ok).toBe(false);
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the authenticated tenant even when a caller supplies another tenant", async () => {
    const result = await setSquareStockWrites({}, fd({ enabled: "true", baselineConfirmed: "on", tenantId: "other-tenant" }));
    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("square_set_stock_writes", {
      p_tenant_id: tenantId, p_channel_id: "channel", p_enabled: true, p_baseline_confirmed: true, p_lease_token: "lease-token",
    });
  });
  it("does not create a service-role client when the user lacks admin access", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("not authorised"));
    expect((await syncSquareAction()).ok).toBe(false);
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("refuses work outside the explicit pilot allowlist", async () => {
    mocks.pilot.mockReturnValue(false);
    expect((await syncSquareAction()).ok).toBe(false);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it("reports a failed database stock-write gate rather than claiming success", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "square_set_stock_writes"
      ? { data: null, error: { message: "unmapped products" } } : { data: name === "claim_square_sync" ? "lease-token" : true, error: null });
    expect((await setSquareStockWrites({}, fd({ enabled: "true", baselineConfirmed: "on" }))).ok).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rejects an ignore without a reason before writing", async () => {
    expect((await saveSquareItem({}, fd({ linkId: tenantId, operation: "ignore", reason: "" }))).ok).toBe(false);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it("rejects a nonexistent mapping instead of acknowledging a zero-row update", async () => {
    expect((await saveSquareItem({}, fd({ linkId: tenantId, operation: "unlink" }))).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalledWith("square_create_retail_link", expect.anything());
    expect(mocks.rpc).toHaveBeenCalledWith("release_square_sync", expect.objectContaining({ p_lease_token: "lease-token" }));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("refuses setup changes while a sync owns the channel lease", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const result = await setSquareStockWrites({}, fd({ enabled: "true", baselineConfirmed: "on" }));
    expect(result).toEqual({ ok: false, message: "Square sync is running. Wait for it to finish, then try again." });
    expect(mocks.rpc).not.toHaveBeenCalledWith("square_set_stock_writes", expect.anything());
  });
  it("cannot turn a service without Square stock tracking into a retail item", async () => {
    mocks.from.mockImplementation((table: string) => queryResponse({ data: table === "square_connection" ? conn : { id: tenantId, tracked_location_ids: [] }, error: null }));
    const result = await saveSquareItem({}, fd({ linkId: tenantId, operation: "create" }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("without Square inventory tracking");
    expect(mocks.rpc).not.toHaveBeenCalledWith("square_create_retail_link", expect.anything());
  });
  it("cannot map a retail variant whose BOM would consume multiple components", async () => {
    mocks.from.mockImplementation((table: string) => queryResponse({ data: table === "square_connection" ? conn
      : table === "channel_item_link" ? { id: tenantId, tracked_location_ids: ["square-location"] }
        : table === "product_bom" ? { id: "bom", lines: [{ quantity: 1, yield_pct: 1 }, { quantity: 1, yield_pct: 1 }] }
          : { id: tenantId }, error: null }));
    const result = await saveSquareItem({}, fd({ linkId: tenantId, operation: "link", variantId: tenantId }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("1:1 active BOM");
    expect(mocks.from).not.toHaveBeenCalledWith("sales_channel");
  });
  it("maps a custom sale alias without replacing its consumption-only ratio", async () => {
    const mappingUpdate = vi.fn();
    mocks.from.mockImplementation((table: string) => {
      const data = table === "square_connection" ? conn
        : table === "channel_item_link" ? { id: tenantId, origin: "order", stock_conversion_ratio: 1, tracked_location_ids: ["square-location"] }
          : table === "product_bom" ? { id: "bom", lines: [{ quantity: 1, yield_pct: 1 }] }
            : table === "sales_channel" ? [{ id: "channel" }] : { id: tenantId };
      const chain = queryResponse({ data, error: null });
      if (table === "channel_item_link") chain.update = (values: unknown) => {
        mappingUpdate(values);
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [{ id: tenantId }], error: null }));
        return chain;
      };
      return chain;
    });
    const result = await saveSquareItem({}, fd({ linkId: tenantId, operation: "link", variantId: tenantId }));
    expect(result.ok).toBe(true);
    const values = mappingUpdate.mock.calls[0][0];
    expect(values).toMatchObject({ variant_id: tenantId, status: "linked", match_method: "manual" });
    expect(values).not.toHaveProperty("stock_conversion_ratio");
    expect(values).not.toHaveProperty("origin");
  });
});
