import type { SupabaseClient } from "@supabase/supabase-js";
import { ChartCard, type ChartTabDef } from "./chart-card";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function OrdersChartCard({ supabase, tenantId }: Props) {
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  const [{ data: orders }, { data: orderLines }] = await Promise.all([
    supabase
      .from("orders")
      .select("id,status,created_at,updated_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", twelveMonthsAgo.toISOString()),
    supabase
      .from("order_line")
      .select("order_id,line_sell_price")
      .eq("tenant_id", tenantId)
      .gte("created_at", twelveMonthsAgo.toISOString()),
  ]);

  // Revenue per order
  const revenueByOrder = new Map<string, number>();
  (orderLines ?? []).forEach(line => {
    revenueByOrder.set(line.order_id, (revenueByOrder.get(line.order_id) ?? 0) + Number(line.line_sell_price ?? 0));
  });

  // 12-month buckets
  const buckets = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return {
      month: d.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      year: d.getFullYear(),
      m: d.getMonth(),
    };
  });

  const chartData = buckets.map(({ month, year, m }) => {
    const monthOrders = (orders ?? []).filter(o => {
      const d = new Date(o.created_at);
      return d.getFullYear() === year && d.getMonth() === m;
    });
    const fulfilled = monthOrders.filter(o => o.status === "fulfilled");
    const revenue = fulfilled.reduce((s, o) => s + (revenueByOrder.get(o.id) ?? 0), 0);
    const avgValue = fulfilled.length > 0 ? revenue / fulfilled.length : 0;

    // Lead time: days from created_at → updated_at for fulfilled orders
    const leadTimes = fulfilled
      .map(o => {
        if (!o.updated_at) return null;
        const diff = (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) / 86_400_000;
        return diff >= 0 ? diff : null;
      })
      .filter((d): d is number => d !== null);
    const avgLeadTime = leadTimes.length > 0
      ? leadTimes.reduce((s, d) => s + d, 0) / leadTimes.length
      : 0;

    return {
      month,
      placed: monthOrders.length,
      fulfilled: fulfilled.length,
      revenue: Math.round(revenue),
      avgValue: Math.round(avgValue),
      leadTime: Math.round(avgLeadTime * 10) / 10,
    };
  });

  const tabs: ChartTabDef[] = [
    {
      id: "volume",
      label: "Orders",
      xKey: "month",
      data: chartData,
      series: [
        { key: "placed", label: "Placed", color: "var(--brand-1)" },
        { key: "fulfilled", label: "Fulfilled", color: "var(--ok)" },
      ],
      formatter: "count",
      multiLine: true,
      emptyText: "No orders in the last 12 months.",
    },
    {
      id: "revenue",
      label: "Revenue",
      xKey: "month",
      data: chartData,
      series: [{ key: "revenue", label: "Revenue", color: "var(--ok)" }],
      formatter: "currency",
      emptyText: "No revenue yet. Fulfilled orders need line prices.",
    },
    {
      id: "avg-order",
      label: "Avg Order",
      xKey: "month",
      data: chartData,
      series: [{ key: "avgValue", label: "Avg order value", color: "var(--info)" }],
      formatter: "currency",
      emptyText: "No fulfilled orders with line prices yet.",
    },
    {
      id: "lead-time",
      label: "Lead Time",
      xKey: "month",
      data: chartData,
      series: [{ key: "leadTime", label: "Avg days to fulfill", color: "var(--warning)" }],
      formatter: "days",
      emptyText: "No fulfilled orders to measure lead time.",
    },
  ];

  return <ChartCard eyebrow="Operations" title="Order metrics" tabs={tabs} />;
}
