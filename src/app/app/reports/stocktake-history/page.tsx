import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportChart } from "../_components/report-chart";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";
import styles from "./stocktake-history.module.css";

interface Row { id: string; date: string; location: string; status: string; lineCount: number; varianceLines: number; totalVarianceQty: number; }
interface ChartPoint extends Record<string, unknown> { date: string; variances: number; }

type SessionRaw = {
  id: string;
  created_at: string;
  status: string | null;
  location: { name: string } | null;
  lines: { id: string; expected_on_hand: number; counted: number }[];
};

const STATUS_VARIANT: Record<string, BadgeVariant> = { completed: "green", in_progress: "blue", draft: "gray" };

export default async function StocktakeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const range = resolveDateRange(sp, 365);

  const { data: sessionsRaw } = await supabase
    .from("stocktake_session")
    .select("id,created_at,status,location:location_id(name),lines:stocktake_line(id,expected_on_hand,counted)")
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const sessions = (sessionsRaw ?? []) as unknown as SessionRaw[];

  const rows: Row[] = sessions.map((s) => {
    const lines = s.lines ?? [];
    const varianceLines = lines.filter((l) => l.counted !== l.expected_on_hand);
    const totalVarianceQty = varianceLines.reduce((sum, l) => sum + Math.abs(l.counted - l.expected_on_hand), 0);
    return {
      id: s.id,
      date: new Date(s.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
      location: s.location?.name ?? "—",
      status: s.status ?? "completed",
      lineCount: lines.length,
      varianceLines: varianceLines.length,
      totalVarianceQty,
    };
  });

  const totalVarianceLines = rows.reduce((s, r) => s + r.varianceLines, 0);
  const largestVariance = rows.reduce((max, r) => Math.max(max, r.totalVarianceQty), 0);
  const chartData: ChartPoint[] = [...rows].reverse().map((r) => ({ date: r.date.slice(0, 6), variances: r.varianceLines }));

  const columns: TableColumn<Row>[] = [
    { key: "date", header: "Date", render: (r) => r.date },
    { key: "location", header: "Location", render: (r) => r.location },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "gray"}>{r.status.replace("_", " ")}</Badge> },
    { key: "lineCount", header: "Lines counted", align: "right", render: (r) => r.lineCount },
    { key: "varianceLines", header: "Variance lines", align: "right", render: (r) => <span className={r.varianceLines > 0 ? styles.variance : styles.noVariance}>{r.varianceLines}</span> },
    { key: "totalVarianceQty", header: "Total variance qty", align: "right", render: (r) => r.totalVarianceQty.toLocaleString() },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Stocktake history"
      description="All stocktake sessions and their variance results."
      csvSlug="stocktake-history"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Stocktakes completed", value: rows.length },
          { label: "Total variance lines", value: totalVarianceLines, variant: totalVarianceLines > 0 ? "amber" : "default" },
          { label: "Largest single variance", value: largestVariance.toLocaleString() },
        ]}
      />
      {chartData.length > 0 && (
        <ReportChart type="bar" title="Variance lines per stocktake" data={chartData} xKey="date" series={[{ dataKey: "variances", color: "var(--warning)", name: "Variance lines" }]} />
      )}
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
