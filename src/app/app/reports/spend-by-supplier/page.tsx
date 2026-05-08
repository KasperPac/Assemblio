import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";
import { ReportChart } from "../_components/report-chart";

interface SupplierRow {
  supplierId: string;
  supplier: string;
  poCount: number;
  totalSpend: number;
  pctOfTotal: number;
  avgPoValue: number;
}

interface SupplierPoint extends Record<string, unknown> {
  supplier: string;
  spend: number;
}

type PORaw = {
  id: string;
  supplier_id: string;
  supplier: { name: string } | null;
  lines: { quantity: number; unit_cost: number }[];
};

export default async function SpendBySupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const range = resolveDateRange(sp, 90);

  const { data } = await supabase
    .from("purchase_order")
    .select(
      "id,supplier_id,supplier:supplier_id(name),lines:purchase_order_line(quantity,unit_cost)"
    )
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());

  const poData = (data ?? []) as unknown as PORaw[];

  // Group by supplier
  const supplierMap = new Map<
    string,
    { name: string; poIds: Set<string>; totalSpend: number }
  >();

  for (const po of poData) {
    const key = po.supplier_id;
    const name = po.supplier?.name ?? "Unknown";
    if (!supplierMap.has(key)) {
      supplierMap.set(key, { name, poIds: new Set(), totalSpend: 0 });
    }
    const entry = supplierMap.get(key)!;
    entry.poIds.add(po.id);
    const poSpend = (po.lines ?? []).reduce(
      (s, l) => s + l.quantity * (l.unit_cost ?? 0),
      0
    );
    entry.totalSpend += poSpend;
  }

  const grandTotal = Array.from(supplierMap.values()).reduce(
    (s, e) => s + e.totalSpend,
    0
  );

  const rows: SupplierRow[] = Array.from(supplierMap.entries())
    .map(([supplierId, entry]) => ({
      supplierId,
      supplier: entry.name,
      poCount: entry.poIds.size,
      totalSpend: entry.totalSpend,
      pctOfTotal: grandTotal > 0 ? (entry.totalSpend / grandTotal) * 100 : 0,
      avgPoValue: entry.poIds.size > 0 ? entry.totalSpend / entry.poIds.size : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const largestSpend = rows.length > 0 ? rows[0].totalSpend : 0;
  const supplierCount = rows.length;

  const chartData: SupplierPoint[] = rows.slice(0, 10).map((r) => ({
    supplier: r.supplier,
    spend: Math.round(r.totalSpend),
  }));

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(n);

  const columns: TableColumn<SupplierRow>[] = [
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    {
      key: "poCount",
      header: "POs",
      align: "right",
      render: (r) => r.poCount,
    },
    {
      key: "totalSpend",
      header: "Total spend",
      align: "right",
      render: (r) => fmtCurrency(r.totalSpend),
    },
    {
      key: "pctOfTotal",
      header: "% of total",
      align: "right",
      render: (r) => `${r.pctOfTotal.toFixed(1)}%`,
    },
    {
      key: "avgPoValue",
      header: "Avg PO value",
      align: "right",
      render: (r) => fmtCurrency(r.avgPoValue),
    },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="Spend by Supplier"
      description="Purchase order spend grouped by supplier."
      csvSlug="spend-by-supplier"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Total spend", value: fmtCurrency(grandTotal) },
          { label: "Suppliers", value: supplierCount },
          {
            label: "Largest supplier",
            value: fmtCurrency(largestSpend),
            variant: "default",
          },
        ]}
      />
      <ReportChart
        type="bar"
        layout="vertical"
        data={chartData}
        xKey="supplier"
        title="Top 10 Suppliers by Spend"
        series={[{ dataKey: "spend", color: "var(--brand-1)", name: "Spend (AUD)" }]}
      />
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.supplierId}
      />
    </ReportShell>
  );
}
