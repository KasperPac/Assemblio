import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { SortableReportTable } from "../_components/sortable-report-table";
import type { TableColumn } from "../_components/report-table";
import styles from "./po-variance.module.css";

type DeliveryReceiptLineRaw = {
  id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  component: { name: string } | null;
  delivery_receipt: {
    supplier: { name: string } | null;
    supplier_name_override: string | null;
    purchase_order: { id: string } | null;
  } | null;
};

interface VarianceRow extends Record<string, unknown> {
  id: string;
  poId: string | null;
  poNumber: string;
  supplier: string;
  component: string;
  ordered: number;
  received: number;
  variance: number;
  variancePct: number;
}

export default async function POVariancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const range = resolveDateRange(sp, 90);

  const { data: lines } = await supabase
    .from("delivery_receipt_line")
    .select(`
      id,
      quantity_delivered,
      quantity_expected,
      component:component_id(name),
      delivery_receipt:delivery_receipt_id(
        supplier_name_override,
        supplier:supplier_id(name),
        purchase_order:purchase_order_id(id)
      )
    `)
    .eq("tenant_id", tenantId)
    .not("quantity_expected", "is", null)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());

  const rawLines = (lines ?? []) as unknown as DeliveryReceiptLineRaw[];

  // Filter to only lines where qty differs
  const varianceLines = rawLines.filter(
    (l) => l.quantity_expected !== null && l.quantity_delivered !== l.quantity_expected
  );

  const rows: VarianceRow[] = varianceLines.map((l) => {
    const ordered = l.quantity_expected!;
    const received = l.quantity_delivered;
    const variance = received - ordered;
    const variancePct = Math.round((variance / ordered) * 100);

    const dr = Array.isArray(l.delivery_receipt) ? l.delivery_receipt[0] : l.delivery_receipt;
    const supplierObj = dr
      ? Array.isArray(dr.supplier)
        ? dr.supplier[0]
        : dr.supplier
      : null;
    const poObj = dr
      ? Array.isArray(dr.purchase_order)
        ? dr.purchase_order[0]
        : dr.purchase_order
      : null;
    const componentObj = Array.isArray(l.component) ? l.component[0] : l.component;

    const supplier = supplierObj?.name ?? dr?.supplier_name_override ?? "—";
    const poNumber = poObj?.id ? poObj.id.slice(0, 8).toUpperCase() : "—";
    const component = componentObj?.name ?? "—";

    return {
      id: l.id,
      poId: poObj?.id ?? null,
      poNumber,
      supplier,
      component,
      ordered,
      received,
      variance,
      variancePct,
    };
  });

  const varianceCount = rows.length;
  const overReceived = rows
    .filter((r) => r.variance > 0)
    .reduce((s, r) => s + r.variance, 0);
  const underReceived = rows
    .filter((r) => r.variance < 0)
    .reduce((s, r) => s + Math.abs(r.variance), 0);

  const columns: TableColumn<VarianceRow>[] = [
    { key: "poNumber", header: "PO #", render: (r) => r.poId
      ? <Link href={`/app/purchasing/${r.poId}`} className={styles.reportLink}>PO-{r.poNumber}</Link>
      : <span>PO-{r.poNumber}</span>
    },
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    { key: "component", header: "Component", render: (r) => r.component },
    { key: "ordered", header: "Ordered", align: "right", render: (r) => r.ordered },
    { key: "received", header: "Received", align: "right", render: (r) => r.received },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      render: (row) => (
        <span style={{ color: row.variance > 0 ? "var(--ok)" : "var(--danger)" }}>
          {row.variance > 0 ? "+" : ""}{row.variance}
        </span>
      ),
    },
    {
      key: "variancePct",
      header: "Variance %",
      align: "right",
      render: (row) => (
        <span style={{ color: row.variancePct > 0 ? "var(--ok)" : "var(--danger)" }}>
          {row.variancePct > 0 ? "+" : ""}{row.variancePct}%
        </span>
      ),
    },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="PO Quantity Variance"
      description="Delivery receipt lines where quantity delivered differs from expected."
      csvSlug="po-variance"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          {
            label: "Variance lines",
            value: varianceCount,
            variant: varianceCount > 0 ? "amber" : "default",
          },
          {
            label: "Over-received qty",
            value: overReceived,
          },
          {
            label: "Under-received qty",
            value: underReceived,
          },
        ]}
      />
      <SortableReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
