import { describe, expect, it, vi } from "vitest";
import { consumeOrderLineSale, isRetailLine } from "./sale-consumption";

describe("consumeOrderLineSale", () => {
  it("calls apply_sale_consumption and returns the component count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const n = await consumeOrderLineSale({ rpc }, { tenantId: "t", orderLineId: "ol", locationId: "l" });
    expect(n).toBe(1);
    expect(rpc).toHaveBeenCalledWith("apply_sale_consumption", {
      p_tenant_id: "t",
      p_order_line_id: "ol",
      p_location_id: "l",
    });
  });

  it("throws when the rpc resolves with an error instead of silently returning 0", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "retail item has no active BOM" } });
    await expect(
      consumeOrderLineSale({ rpc }, { tenantId: "t", orderLineId: "ol", locationId: "l" })
    ).rejects.toThrow("apply_sale_consumption: retail item has no active BOM");
  });
});

describe("isRetailLine", () => {
  it("reads kind through object or array embeds", () => {
    expect(isRetailLine({ variant: { product: { kind: "retail" } } })).toBe(true);
    expect(isRetailLine({ variant: [{ product: [{ kind: "retail" }] }] })).toBe(true);
    expect(isRetailLine({ variant: { product: { kind: "manufactured" } } })).toBe(false);
    expect(isRetailLine({ variant: null })).toBe(false);
    expect(isRetailLine({})).toBe(false);
  });
});
