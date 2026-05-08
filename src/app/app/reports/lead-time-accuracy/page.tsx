import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../_lib/date-range";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

type ReceiptRow = {
  id: string;
  received_at: string;
  purchase_order: {
    expected_date?: string | null;
    supplier?: { name: string } | null;
  } | null;
};

interface SupplierAccuracy extends Record<string, unknown> {
  supplier: string;
  received: number;
  onTime: number;
  late: number;
  accuracy: number;
  avgDaysLate: number;
}

export default async function LeadTimeAccuracyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const range = resolveDateRange(sp, 90);

  const { data: receipts } = await supabase
    .from("delivery_receipt")
    .select(`
      id,
      received_at,
      purchase_order:purchase_order_id(
        expected_date,
        supplier:supplier_id(name)
      )
    `)
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null)
    .gte("received_at", range.from.toISOString())
    .lte("received_at", range.to.toISOString());

  const receiptData = (receipts ?? []) as unknown as ReceiptRow[];

  // Group by supplier
  const supplierMap = new Map<
    string,
    { received: number; onTime: number; late: number; lateDaysTotal: number }
  >();

  for (const receipt of receiptData) {
    const supplierName = receipt.purchase_order?.supplier?.name ?? "Unknown";
    if (!supplierMap.has(supplierName)) {
      supplierMap.set(supplierName, { received: 0, onTime: 0, late: 0, lateDaysTotal: 0 });
    }
    const entry = supplierMap.get(supplierName)!;
    entry.received += 1;

    const expectedDate = receipt.purchase_order?.expected_date;
    if (!expectedDate) {
      // Treat as on time when no expected date
      entry.onTime += 1;
    } else {
      const receivedAt = new Date(receipt.received_at);
      const expected = new Date(expectedDate);
      if (receivedAt <= expected) {
        entry.onTime += 1;
      } else {
        entry.late += 1;
        const daysLate = (receivedAt.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24);
        entry.lateDaysTotal += daysLate;
      }
    }
  }

  const rows: SupplierAccuracy[] = Array.from(supplierMap.entries())
    .map(([supplier, entry]) => ({
      supplier,
      received: entry.received,
      onTime: entry.onTime,
      late: entry.late,
      accuracy: Math.round((entry.onTime / entry.received) * 100),
      avgDaysLate: entry.late > 0 ? entry.lateDaysTotal / entry.late : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const totalReceipts = receiptData.length;
  const totalOnTime = rows.reduce((s, r) => s + r.onTime, 0);
  const onTimePct = totalReceipts > 0 ? Math.round((totalOnTime / totalReceipts) * 100) : 100;
  const belowThreshold = rows.filter((r) => r.accuracy < 80).length;

  const overallVariant =
    onTimePct < 80 ? "red" : onTimePct >= 95 ? "green" : "default";
  const belowVariant = belowThreshold > 0 ? "red" : "default";

  const columns: TableColumn<SupplierAccuracy>[] = [
    { key: "supplier", header: "Supplier", render: (r) => r.supplier },
    { key: "received", header: "POs Received", align: "right", render: (r) => r.received },
    { key: "onTime", header: "On time", align: "right", render: (r) => r.onTime },
    {
      key: "late",
      header: "Late",
      align: "right",
      render: (row) => (
        <span style={{ color: row.late > 0 ? "var(--warning)" : undefined }}>
          {row.late}
        </span>
      ),
    },
    {
      key: "accuracy",
      header: "Accuracy %",
      align: "right",
      render: (row) => (
        <span style={{ color: row.accuracy < 80 ? "var(--danger)" : undefined }}>
          {row.accuracy}%
        </span>
      ),
    },
    {
      key: "avgDaysLate",
      header: "Avg days late",
      align: "right",
      render: (r) => (r.avgDaysLate > 0 ? `${r.avgDaysLate.toFixed(1)}d` : "—"),
    },
  ];

  return (
    <ReportShell
      eyebrow="Purchasing"
      title="Lead Time Accuracy"
      description="On-time delivery performance per supplier."
      csvSlug="lead-time-accuracy"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          {
            label: "Overall on-time",
            value: `${onTimePct}%`,
            variant: overallVariant,
          },
          {
            label: "Suppliers below 80%",
            value: belowThreshold,
            variant: belowVariant,
          },
          {
            label: "Total receipts",
            value: totalReceipts,
          },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.supplier}
      />
    </ReportShell>
  );
}
