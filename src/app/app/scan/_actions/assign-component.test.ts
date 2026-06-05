import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { assignComponentToLocation, removeComponentFromLocation } from "./assign-component";

function makeSupabase(updateError: null | { message: string } = null) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: updateError }).then(resolve),
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

function makeCtx(updateError: null | { message: string } = null) {
  return { supabase: makeSupabase(updateError) as any, tenantId: "t1" };
}

beforeEach(() => vi.clearAllMocks());

describe("assignComponentToLocation", () => {
  it("returns ok:false when context missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await assignComponentToLocation("c1", "bay1", "bay")).toEqual({ ok: false });
  });

  it("sets bin_bay_id when type is bay", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    const result = await assignComponentToLocation("c1", "bay1", "bay");
    expect(result).toEqual({ ok: true });
    expect(ctx.supabase._chain.update).toHaveBeenCalledWith({ bin_bay_id: "bay1" });
  });

  it("sets bin_aisle_id when type is aisle", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await assignComponentToLocation("c1", "a1", "aisle");
    expect(ctx.supabase._chain.update).toHaveBeenCalledWith({ bin_aisle_id: "a1" });
  });

  it("sets bin_sub_location_id when type is sub_location", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await assignComponentToLocation("c1", "sl1", "sub_location");
    expect(ctx.supabase._chain.update).toHaveBeenCalledWith({ bin_sub_location_id: "sl1" });
  });

  it("sets location_id when type is warehouse", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await assignComponentToLocation("c1", "wh1", "warehouse");
    expect(ctx.supabase._chain.update).toHaveBeenCalledWith({ location_id: "wh1" });
  });

  it("returns ok:false on DB error", async () => {
    const ctx = makeCtx({ message: "constraint violation" });
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    expect(await assignComponentToLocation("c1", "b1", "bay")).toEqual({ ok: false });
  });
});

describe("removeComponentFromLocation", () => {
  it("nulls bin_bay_id when type is bay", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await removeComponentFromLocation("c1", "bay");
    expect(ctx.supabase._chain.update).toHaveBeenCalledWith({ bin_bay_id: null });
  });

  it("nulls bin_aisle_id when type is aisle", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await removeComponentFromLocation("c1", "aisle");
    expect(ctx.supabase._chain.update).toHaveBeenCalledWith({ bin_aisle_id: null });
  });

  it("returns ok:false when context missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await removeComponentFromLocation("c1", "bay")).toEqual({ ok: false });
  });
});
