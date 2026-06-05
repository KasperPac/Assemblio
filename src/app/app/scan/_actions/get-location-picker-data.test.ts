import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { getWarehouses, getAislesForWarehouse, getBaysForAisle } from "./get-location-picker-data";

// Builder for a chainable Supabase mock that resolves via .order()
function makeSupabase(data: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function makeCtx(data: unknown) {
  const sb = makeSupabase(data);
  return { supabase: sb as any, tenantId: "t1" };
}

beforeEach(() => vi.clearAllMocks());

describe("getWarehouses", () => {
  it("returns empty array when context is missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await getWarehouses()).toEqual([]);
  });

  it("returns warehouses from DB", async () => {
    const rows = [{ id: "wh1", name: "Main Warehouse" }];
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx(rows) as any);
    expect(await getWarehouses()).toEqual(rows);
  });
});

describe("getAislesForWarehouse", () => {
  it("returns empty array when context is missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await getAislesForWarehouse("wh1")).toEqual([]);
  });

  it("maps sub_location join to subLocationName", async () => {
    const rows = [
      { id: "a1", name: "Aisle 1", warehouse_id: "wh1", sub_location: { name: "Mezzanine" } },
      { id: "a2", name: "Aisle 2", warehouse_id: "wh1", sub_location: null },
    ];
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx(rows) as any);
    const result = await getAislesForWarehouse("wh1");
    expect(result[0].subLocationName).toBe("Mezzanine");
    expect(result[1].subLocationName).toBeNull();
  });

  it("handles array-shaped join result from PostgREST", async () => {
    // PostgREST sometimes returns the joined row as a single-element array
    const rows = [
      { id: "a1", name: "Aisle 1", warehouse_id: "wh1", sub_location: [{ name: "Ground" }] },
    ];
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx(rows) as any);
    const result = await getAislesForWarehouse("wh1");
    expect(result[0].subLocationName).toBe("Ground");
  });
});

describe("getBaysForAisle", () => {
  it("returns empty array when context is missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await getBaysForAisle("a1")).toEqual([]);
  });

  it("returns bays for an aisle", async () => {
    const rows = [{ id: "b1", name: "Bay 1" }];
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx(rows) as any);
    expect(await getBaysForAisle("a1")).toEqual([{ id: "b1", name: "Bay 1" }]);
  });
});
