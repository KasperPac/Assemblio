import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

type ReceiptRow = {
  id: string;
  received_at: string;
  purchase_order: {
    expected_date?: string | null;
    supplier?: { name: string } | null;
  } | null;
};

export async function GET(req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
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

  const rows = Array.from(supplierMap.entries())
    .map(([supplier, entry]) => ({
      supplier,
      received: entry.received,
      onTime: entry.onTime,
      late: entry.late,
      accuracy: Math.round((entry.onTime / entry.received) * 100),
      avgDaysLate: entry.late > 0 ? entry.lateDaysTotal / entry.late : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const headers = [
    "Supplier",
    "POs Received",
    "On Time",
    "Late",
    "Accuracy %",
    "Avg Days Late",
  ];

  const lines = rows.map((r) =>
    [
      r.supplier,
      r.received,
      r.onTime,
      r.late,
      r.accuracy,
      r.avgDaysLate.toFixed(1),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="lead-time-accuracy.csv"',
    },
  });
}
