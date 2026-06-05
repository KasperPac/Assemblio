import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { getSessionLines } from "./get-session-lines";
import type { ResolvedLocation } from "./resolve-barcode";

const BAY_LOC: ResolvedLocation = {
  type: "bay",
  id: "bay1",
  name: "Bay 1",
  path: "Wh · A1 · Bay 1",
  warehouseId: "wh1",
};

beforeEach(() => vi.clearAllMocks());

describe("getSessionLines", () => {
  it("returns [] when tenant context is missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await getSessionLines("s1", BAY_LOC)).toEqual([]);
  });

  it("returns [] when session is not found", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: supabase as any,
      tenantId: "t1",
    } as any);
    expect(await getSessionLines("missing-session", BAY_LOC)).toEqual([]);
  });

  it("returns [] when no components at location", async () => {
    let callCount = 0;
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // session query
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "s1", blind_count: false },
              error: null,
            }),
          };
        }
        // component query — returns empty
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
      }),
    };
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: supabase as any,
      tenantId: "t1",
    } as any);
    expect(await getSessionLines("s1", BAY_LOC)).toEqual([]);
  });

  it("returns null expectedOnHand for blind_count sessions", async () => {
    let callCount = 0;
    const lineData = [
      {
        id: "l1",
        component_id: "c1",
        expected_on_hand: 10,
        counted: null,
        component: { id: "c1", name: "Bolt M6", sku: "B-M6" },
      },
    ];
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "s1", blind_count: true },
              error: null,
            }),
          };
        }
        if (callCount === 2) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: [{ id: "c1" }], error: null }).then(resolve),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: lineData, error: null }).then(resolve),
        };
      }),
    };
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: supabase as any,
      tenantId: "t1",
    } as any);
    const result = await getSessionLines("s1", BAY_LOC);
    expect(result).toHaveLength(1);
    expect(result[0].expectedOnHand).toBeNull();
    expect(result[0].name).toBe("Bolt M6");
  });
});
