import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import styles from "./valuation.module.css";

interface Row extends Record<string, unknown> {
  id: string; name: string; sku: string | null;
  on_hand: number; in_prod: number; reserved: number;
  cost: number; value: number; pct: number;
}

type BalanceRaw = {
  component_id: string;
  on_hand: number;
  in_prod: number | null;
  reserved: number | null;
  component: { name: string; sku: string | null; cost_per_unit: number | null } | null;
};

export default async function ValuationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: raw } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand,in_prod,reserved,component:component_id(name,sku,cost_per_unit)")
    .eq("tenant_id", tenantId)
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const balances = (raw ?? []) as unknown as BalanceRaw[];

  const totalOnHandValue = balances.reduce((s, b) => s + b.on_hand * (b.component?.cost_per_unit ?? 0), 0);
  const totalInProdValue = balances.reduce((s, b) => s + (b.in_prod ?? 0) * (b.component?.cost_per_unit ?? 0), 0);
  const totalReservedValue = balances.reduce((s, b) => s + (b.reserved ?? 0) * (b.component?.cost_per_unit ?? 0), 0);

  const rows: Row[] = balances.map((b) => {
    const c = b.component;
    const cost = c?.cost_per_unit ?? 0;
    const value = b.on_hand * cost;
    return {
      id: b.component_id,
      name: c?.name ?? "—",
      sku: c?.sku ?? null,
      on_hand: b.on_hand,
      in_prod: b.in_prod ?? 0,
      reserved: b.reserved ?? 0,
      cost,
      value,
      pct: totalOnHandValue > 0 ? (value / totalOnHandValue) * 100 : 0,
    };
  }).sort((a, b) => b.value - a.value);

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "Component", render: (r) => (
      <Link href={`/app/components/${r.id}`} className={styles.reportLink}>{r.name}</Link>
    )},
    { key: "sku", header: "SKU", render: (r) => r.sku ?? "—" },
    { key: "on_hand", header: "On hand", align: "right", render: (r) => r.on_hand.toLocaleString() },
    { key: "cost", header: "Cost / unit", align: "right", render: (r) => fmtCurrency(r.cost) },
    { key: "value", header: "Total value", align: "right", render: (r) => fmtCurrency(r.value) },
    { key: "pct", header: "% of total", align: "right", render: (r) => <span style={{ color: "var(--ink-muted)" }}>{r.pct.toFixed(1)}%</span> },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Inventory valuation"
      description="On-hand stock value broken down by component."
      csvSlug="valuation"
      searchParams={sp}
      hideDateRange={true}
    >
      <ReportStatCards
        cards={[
          { label: "On-hand value", value: fmtCurrency(totalOnHandValue) },
          { label: "In-production value", value: fmtCurrency(totalInProdValue) },
          { label: "Reserved value", value: fmtCurrency(totalReservedValue) },
        ]}
      />
      <SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
