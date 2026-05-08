import { describe, it, expect } from "vitest";
import { loadDashboardConfig } from "./config";
import { PRESET_WIDGETS } from "./types";

function mockSupabase(data: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data, error: null }),
        }),
      }),
    }),
  } as any;
}

describe("loadDashboardConfig", () => {
  it("returns owner preset when no config row exists", async () => {
    const result = await loadDashboardConfig(mockSupabase(null), "tenant-1");
    expect(result).toEqual(PRESET_WIDGETS.owner);
  });

  it("returns saved widget list when config exists", async () => {
    const widgets = ["open-orders-queue", "bom-health"];
    const result = await loadDashboardConfig(mockSupabase({ widgets }), "tenant-1");
    expect(result).toEqual(["open-orders-queue", "bom-health"]);
  });

  it("filters out unknown widget IDs from saved config", async () => {
    const widgets = ["open-orders-queue", "invalid-widget-xyz"];
    const result = await loadDashboardConfig(mockSupabase({ widgets }), "tenant-1");
    expect(result).toEqual(["open-orders-queue"]);
  });

  it("falls back to owner preset when all saved IDs are invalid", async () => {
    const result = await loadDashboardConfig(mockSupabase({ widgets: ["bad-id"] }), "tenant-1");
    expect(result).toEqual(PRESET_WIDGETS.owner);
  });

  it("returns owner preset when the DB call returns an error", async () => {
    const errSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "connection refused" } }),
          }),
        }),
      }),
    } as any;
    const result = await loadDashboardConfig(errSupabase, "tenant-1");
    expect(result).toEqual(PRESET_WIDGETS.owner);
  });
});
