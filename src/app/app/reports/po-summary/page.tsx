import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import { Badge } from "../_components/report-table";
import type { TableColumn, BadgeVariant } from "../_components/report-table";
import styles from "./po-summary.module.css";

interface Row extends Record<string, unknown> {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  expectedDate: string | null;
  totalValue: number;
  lineCount: number;
  overdue: boolean;
}

type PORaw = {
  id: string;
  created_at: string;
  expected_date: string | null;
  status: string | null;
  supplier: { name: string } | null;
  lines: { quantity: number; unit_cost: number }[];
};

const STATUS_VARIANT: Record<string, BadgeVariant> = { draft: "gray", sent: "blue", partial: "amber", received: "green", cancelled: "gray" };

export default async function POSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const range = resolveDateRange(sp, 90);
  const now = new Date();

  const { data } = await supabase
    .from("purchase_order")
    .select("id,created_at,expected_date,status,supplier:supplier_id(name),lines:purchase_order_line(quantity,unit_cost)")
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const purchaseOrders = (data ?? []) as unknown as PORaw[];

  const rows: Row[] = purchaseOrders.map((po) => {
    const lines = po.lines ?? [];
    const totalValue = lines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
    const overdue = !["received", "cancelled"].includes(po.status ?? "") && !!po.expected_date && new Date(po.expected_date) < now;
    return {
      id: po.id,
      poNumber: po.id.slice(0, 8).toUpperCase(),
      supplier: po.supplier?.name ?? "—",
      status: po.status ?? "draft",
      expectedDate: po.expected_date ? new Date(po.expected_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null,
      totalValue,
      lineCount: lines.length,
      overdue,
    };
  });

  const openRows = rows.filter((r) => !["received", "cancelled"].includes(r.status));
  const openLiability = openRows.reduce((s, r) => s + r.totalValue, 0);
  const overdueCount = rows.filter((r) => r.overdue).length;

  const fmtCurrency = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

  const columns: TableColumn<Row>[] = [
    { key: "poNumber", header: "PO #", render: (r) => (
      <Link href={`/app/purchasing/${r.id}`} className={styles.reportLink}>
        PO-{r.poNumber}
      </Link>
    )},
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    { key: "status", header: "Status", render: (r) => <Badge variant={STATUS_VARIANT[r.status] ?? "gray"}>{r.status}</Badge> },
    { key: "expectedDate", header: "Expected date", render: (r) => <span className={r.overdue ? styles.overdue : undefined}>{r.expectedDate ?? "—"}{r.overdue ? " ⚠" : ""}</span> },
    { key: "value", header: "Total value", align: "right", render: (r) => fmtCurrency(r.totalValue) },
    { key: "lines", header: "Lines", align: "right", render: (r) => r.lineCount },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="PO summary"
      description="Purchase orders in the selected period."
      csvSlug="po-summary"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Open liability", value: fmtCurrency(openLiability) },
          { label: "POs outstanding", value: openRows.length },
          { label: "Overdue POs", value: overdueCount, variant: overdueCount > 0 ? "red" : "default" },
        ]}
      />
      <SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
