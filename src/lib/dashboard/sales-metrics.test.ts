import { describe, expect, it } from "vitest";
import { deriveDashboardSalesMetrics, type ProductSalesRow } from "./sales-metrics";

const rows: ProductSalesRow[] = [
  { product_id: "a", title: "Widget A", units: 10, revenue: 1000, material_cost: 400, profit: 600, has_bom: true },
  { product_id: "b", title: "Widget B", units: 50, revenue: 500, material_cost: 0, profit: 500, has_bom: false },
  { product_id: "c", title: "Widget C", units: 5, revenue: 2000, material_cost: 1200, profit: 800, has_bom: true },
];

describe("deriveDashboardSalesMetrics", () => {
  it("computes totals, AOV, and gross margin %", () => {
    const m = deriveDashboardSalesMetrics(rows, 20);
    expect(m.totalRevenue).toBe(3500);
    expect(m.totalUnits).toBe(65);
    expect(m.totalMaterialCost).toBe(1600);
    expect(m.avgOrderValue).toBe(175);
    expect(m.grossMarginPct).toBeCloseTo(54.2857, 3);
  });

  it("ranks most popular by units (desc) and highest profit by profit (desc), top 3", () => {
    const m = deriveDashboardSalesMetrics(rows, 20);
    expect(m.mostPopular.map((r) => r.product_id)).toEqual(["b", "a", "c"]);
    expect(m.highestProfit.map((r) => r.product_id)).toEqual(["c", "a", "b"]);
  });

  it("guards divide-by-zero for AOV and margin", () => {
    const m = deriveDashboardSalesMetrics([], 0);
    expect(m.totalRevenue).toBe(0);
    expect(m.avgOrderValue).toBe(0);
    expect(m.grossMarginPct).toBe(0);
    expect(m.mostPopular).toEqual([]);
    expect(m.highestProfit).toEqual([]);
  });

  it("caps each list at 3", () => {
    const many: ProductSalesRow[] = Array.from({ length: 5 }, (_, i) => ({
      product_id: String(i), title: `P${i}`, units: i, revenue: i * 100,
      material_cost: 0, profit: i * 100, has_bom: true,
    }));
    const m = deriveDashboardSalesMetrics(many, 5);
    expect(m.mostPopular).toHaveLength(3);
    expect(m.highestProfit).toHaveLength(3);
  });
});
