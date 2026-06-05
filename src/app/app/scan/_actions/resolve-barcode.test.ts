import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveBarcode } from "./resolve-barcode";

function makeSupabase(rpcData: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcData, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveBarcode", () => {
  it("returns null when tenant context is missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    const result = await resolveBarcode("ABC123");
    expect(result).toBeNull();
  });

  it("returns null when RPC returns null", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: makeSupabase(null) as any,
      tenantId: "t1",
    } as any);
    const result = await resolveBarcode("ABC123");
    expect(result).toBeNull();
  });

  it("returns parsed ResolvedLocation for a known bay code", async () => {
    const rpcResult = {
      type: "bay",
      id: "bay-uuid",
      name: "Bay 3",
      path: "Main · Aisle 1 · Bay 3",
      warehouse_id: "wh-uuid",
    };
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: makeSupabase(rpcResult) as any,
      tenantId: "t1",
    } as any);
    const result = await resolveBarcode("abc123");
    expect(result).toEqual({
      type: "bay",
      id: "bay-uuid",
      name: "Bay 3",
      path: "Main · Aisle 1 · Bay 3",
      warehouseId: "wh-uuid",
    });
  });

  it("passes uppercased code to RPC", async () => {
    const supabase = makeSupabase(null);
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: supabase as any,
      tenantId: "t1",
    } as any);
    await resolveBarcode("abc123");
    expect(supabase.rpc).toHaveBeenCalledWith("resolve_location_barcode", {
      p_code: "ABC123",
    });
  });
});
