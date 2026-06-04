export type ProductSalesRow = {
  product_id: string;
  title: string;
  units: number;
  revenue: number;
  material_cost: number;
  profit: number;
  has_bom: boolean;
};

export type DashboardSalesMetrics = {
  totalRevenue: number;
  totalUnits: number;
  totalMaterialCost: number;
  avgOrderValue: number;
  grossMarginPct: number;
  mostPopular: ProductSalesRow[];
  highestProfit: ProductSalesRow[];
};

const TOP_N = 3;

export function deriveDashboardSalesMetrics(
  rows: ProductSalesRow[],
  orderCount: number
): DashboardSalesMetrics {
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalUnits = rows.reduce((s, r) => s + Number(r.units ?? 0), 0);
  const totalMaterialCost = rows.reduce((s, r) => s + Number(r.material_cost ?? 0), 0);

  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
  const grossMarginPct =
    totalRevenue > 0 ? ((totalRevenue - totalMaterialCost) / totalRevenue) * 100 : 0;

  const mostPopular = [...rows]
    .sort((a, b) => Number(b.units) - Number(a.units))
    .slice(0, TOP_N);
  const highestProfit = [...rows]
    .sort((a, b) => Number(b.profit) - Number(a.profit))
    .slice(0, TOP_N);

  return {
    totalRevenue,
    totalUnits,
    totalMaterialCost,
    avgOrderValue,
    grossMarginPct,
    mostPopular,
    highestProfit,
  };
}
