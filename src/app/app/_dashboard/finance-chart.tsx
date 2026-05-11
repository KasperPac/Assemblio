import type { SupabaseClient } from "@supabase/supabase-js";
import { ChartCard, type ChartTabDef } from "./chart-card";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

function monthBuckets(count: number) {
  const now = new Date();
  return Array.from({ length: count }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return {
      label: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      year: d.getFullYear(),
      m: d.getMonth(),
    };
  });
}

export async function FinanceChartCard({ supabase, tenantId }: Props) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [{ data: movements }, { data: sessions }, { data: stocktakeLines }] = await Promise.all([
    supabase
      .from("inventory_movement")
      .select("created_at,delta_on_hand,component:component_id(cost_per_unit)")
      .eq("tenant_id", tenantId)
      .gte("created_at", sixMonthsAgo.toISOString()),
    supabase
      .from("stocktake_session")
      .select("id,created_at,status")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("stocktake_line")
      .select("session_id,expected_on_hand,counted")
      .eq("tenant_id", tenantId),
  ]);

  // Inventory inbound/outbound value by month
  const buckets = monthBuckets(6);
  const inventoryData = buckets.map(({ label, year, m }) => {
    const rows = (movements ?? []).filter(r => {
      const d = new Date(r.created_at);
      return d.getFullYear() === year && d.getMonth() === m;
    });
    const inbound = rows
      .filter(r => Number(r.delta_on_hand) > 0)
      .reduce((s, r) => s + Number(r.delta_on_hand) * Number(firstOf(r.component)?.cost_per_unit ?? 0), 0);
    const outbound = rows
      .filter(r => Number(r.delta_on_hand) < 0)
      .reduce((s, r) => s + Math.abs(Number(r.delta_on_hand)) * Number(firstOf(r.component)?.cost_per_unit ?? 0), 0);
    return { month: label, inbound: Math.round(inbound), outbound: Math.round(outbound) };
  });

  // Stocktake variance per completed session
  const varianceMap = new Map<string, number>();
  (stocktakeLines ?? []).forEach(line => {
    const v = Math.abs(Number(line.expected_on_hand ?? 0) - Number(line.counted ?? 0));
    varianceMap.set(line.session_id, (varianceMap.get(line.session_id) ?? 0) + v);
  });
  const completedSessions = (sessions ?? []).filter(s => s.status === "complete" || s.status === "closed");
  const stocktakeData = completedSessions.slice(-12).map(s => ({
    date: new Date(s.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    variance: Math.round(varianceMap.get(s.id) ?? 0),
  }));

  const tabs: ChartTabDef[] = [
    {
      id: "inventory",
      label: "Inventory",
      xKey: "month",
      data: inventoryData,
      series: [
        { key: "inbound", label: "Received", color: "var(--ok)" },
        { key: "outbound", label: "Consumed", color: "var(--brand-1)" },
      ],
      formatter: "currency",
      multiLine: true,
      emptyText: "No inventory movements in the last 6 months.",
    },
    {
      id: "stocktake",
      label: "Stocktake",
      xKey: "date",
      data: stocktakeData,
      series: [{ key: "variance", label: "Variance (units)", color: "var(--warning)" }],
      formatter: "units",
      emptyText: "No completed stocktake sessions yet.",
    },
  ];

  return <ChartCard eyebrow="Finance" title="Inventory trends" tabs={tabs} />;
}
