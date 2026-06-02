import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import { IdleThresholdControl } from "./idle-threshold-control";
import styles from "./dead-stock.module.css";

interface Row extends Record<string, unknown> { id: string; name: string; sku: string | null; on_hand: number; value: number; daysIdle: number; }

type BalanceRaw = {
  component_id: string;
  on_hand: number;
  component: { name: string; sku: string | null; cost_per_unit: number | null } | null;
};

type MovRaw = {
  component_id: string;
  created_at: string;
};

export default async function DeadStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; idle?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const idleThreshold = Number(sp.idle ?? 90);
  const cutoff = new Date(Date.now() - idleThreshold * 24 * 60 * 60 * 1000).toISOString();

  const { data: balancesRaw } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand,component:component_id(name,sku,cost_per_unit)")
    .eq("tenant_id", tenantId)
    .gt("on_hand", 0);

  const { data: recentMovRaw } = await supabase
    .from("inventory_movement")
    .select("component_id")
    .eq("tenant_id", tenantId)
    .gte("created_at", cutoff);

  const balances = (balancesRaw ?? []) as unknown as BalanceRaw[];
  const recentMov = (recentMovRaw ?? []) as unknown as Pick<MovRaw, "component_id">[];

  const activeIds = new Set(recentMov.map((m) => m.component_id));
  const deadIds = balances.filter((b) => !activeIds.has(b.component_id)).map((b) => b.component_id);

  const lastMovementByComponent: Record<string, string> = {};
  if (deadIds.length > 0) {
    const { data: lastMovsRaw } = await supabase
      .from("inventory_movement")
      .select("component_id,created_at")
      .eq("tenant_id", tenantId)
      .in("component_id", deadIds)
      .order("created_at", { ascending: false });
    const lastMovs = (lastMovsRaw ?? []) as unknown as MovRaw[];
    for (const m of lastMovs) {
      if (!lastMovementByComponent[m.component_id]) lastMovementByComponent[m.component_id] = m.created_at;
    }
  }

  const now = Date.now();
  const rows: Row[] = balances
    .filter((b) => !activeIds.has(b.component_id))
    .map((b) => {
      const c = b.component;
      const lastMov = lastMovementByComponent[b.component_id];
      const daysIdle = lastMov ? Math.floor((now - new Date(lastMov).getTime()) / (24 * 60 * 60 * 1000)) : 999;
      return { id: b.component_id, name: c?.name ?? "—", sku: c?.sku ?? null, on_hand: b.on_hand, value: b.on_hand * (c?.cost_per_unit ?? 0), daysIdle };
    })
    .sort((a, b) => b.daysIdle - a.daysIdle);

  const totalCapital = rows.reduce((s, r) => s + r.value, 0);
  const longestIdle = rows[0]?.daysIdle ?? 0;
  const fmtCurrency = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "Component", render: (r) => (
      <Link href={`/app/components/${r.id}`} className={styles.reportLink}>{r.name}</Link>
    )},
    { key: "sku", header: "SKU", render: (r) => r.sku ?? "—" },
    { key: "on_hand", header: "On hand", align: "right", render: (r) => r.on_hand.toLocaleString() },
    { key: "value", header: "Value", align: "right", render: (r) => fmtCurrency(r.value) },
    {
      key: "daysIdle", header: "Days idle", align: "right",
      render: (r) => (
        <span className={
          r.daysIdle >= 180 ? styles.idleHigh
          : r.daysIdle >= 90 ? styles.idleMed
          : styles.idleLow
        }>
          {r.daysIdle === 999 ? "never moved" : r.daysIdle}
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Dead stock"
      description={`Components with on-hand stock and no movement in the last ${idleThreshold} days.`}
      csvSlug="dead-stock"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Dead components", value: rows.length, variant: rows.length > 0 ? "amber" : "default" },
          { label: "Capital tied up", value: fmtCurrency(totalCapital), variant: rows.length > 0 ? "amber" : "default" },
          { label: "Longest idle", value: longestIdle === 999 ? "—" : `${longestIdle}d` },
        ]}
      />
      <Suspense fallback={null}>
        <IdleThresholdControl current={idleThreshold} />
      </Suspense>
      <SortableReportTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyMessage={`No components idle for ${idleThreshold}+ days.`}
      />
    </ReportShell>
  );
}
