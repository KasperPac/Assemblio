import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportChart } from "../_components/report-chart";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";

interface Row { id: string; date: string; component: string; type: string; reference: string; qty: number; }
interface ChartPoint extends Record<string, unknown> { day: string; in: number; out: number; }

type MovementRaw = {
  id: string;
  created_at: string;
  delta_on_hand: number;
  reason: string | null;
  reference_type: string | null;
  component: { name: string } | null;
};

const TYPE_VARIANT: Record<string, BadgeVariant> = {
  receipt: "green", allocation: "blue", adjustment: "amber", stocktake: "gray",
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const range = resolveDateRange(sp, 30);

  const { data } = await supabase
    .from("inventory_movement")
    .select("id,created_at,delta_on_hand,reason,reference_type,component:component_id(name)")
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const movements = (data ?? []) as unknown as MovementRaw[];

  const totalIn = movements.filter((m) => m.delta_on_hand > 0).reduce((s, m) => s + m.delta_on_hand, 0);
  const totalOut = Math.abs(movements.filter((m) => m.delta_on_hand < 0).reduce((s, m) => s + m.delta_on_hand, 0));

  const byDay: Record<string, { in: number; out: number }> = {};
  for (const m of movements) {
    const day = m.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { in: 0, out: 0 };
    if (m.delta_on_hand > 0) byDay[day].in += m.delta_on_hand;
    else byDay[day].out += Math.abs(m.delta_on_hand);
  }
  const chartData: ChartPoint[] = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day: day.slice(5), ...v }));

  const rows: Row[] = movements.map((m) => ({
    id: m.id,
    date: new Date(m.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    component: m.component?.name ?? "—",
    type: m.reason ?? m.reference_type ?? "adjustment",
    reference: m.reference_type ?? "—",
    qty: m.delta_on_hand,
  }));

  const columns: TableColumn<Row>[] = [
    { key: "date", header: "Date", render: (r) => <span style={{ color: "var(--ink-muted)" }}>{r.date}</span> },
    { key: "component", header: "Component", render: (r) => r.component },
    { key: "type", header: "Type", render: (r) => <Badge variant={TYPE_VARIANT[r.type] ?? "gray"}>{r.type}</Badge> },
    { key: "ref", header: "Reference", render: (r) => r.reference },
    {
      key: "qty", header: "Qty", align: "right",
      render: (r) => (
        <span style={{ color: r.qty > 0 ? "var(--ok)" : r.qty < 0 ? "var(--danger)" : "var(--ink-muted)", fontWeight: 600 }}>
          {r.qty > 0 ? `+${r.qty}` : r.qty}
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Movements ledger"
      description="Every stock movement in the selected period."
      csvSlug="movements"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Total movements", value: movements.length },
          { label: "Stock in", value: `+${totalIn.toLocaleString()}`, variant: "green" },
          { label: "Stock out", value: `−${totalOut.toLocaleString()}`, variant: "red" },
        ]}
      />
      {chartData.length > 0 && (
        <ReportChart
          type="bar"
          title="Daily movements"
          data={chartData}
          xKey="day"
          series={[
            { dataKey: "in", color: "var(--ok)", name: "Stock in" },
            { dataKey: "out", color: "var(--danger)", name: "Stock out" },
          ]}
        />
      )}
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
