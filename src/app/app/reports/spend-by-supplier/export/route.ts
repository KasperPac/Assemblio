import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

type PORaw = {
  id: string;
  supplier_id: string;
  supplier: { name: string } | null;
  lines: { quantity: number; unit_cost: number }[];
};

export async function GET(req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 365);

  const { data } = await supabase
    .from("purchase_order")
    .select(
      "id,supplier_id,supplier:supplier_id(name),lines:purchase_order_line(quantity,unit_cost)"
    )
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString());

  const poData = (data ?? []) as unknown as PORaw[];

  // Group by supplier
  const supplierMap = new Map<
    string,
    { name: string; poIds: Set<string>; totalSpend: number }
  >();

  for (const po of poData) {
    const key = po.supplier_id;
    const name = po.supplier?.name ?? "Unknown";
    if (!supplierMap.has(key)) {
      supplierMap.set(key, { name, poIds: new Set(), totalSpend: 0 });
    }
    const entry = supplierMap.get(key)!;
    entry.poIds.add(po.id);
    const poSpend = (po.lines ?? []).reduce(
      (s, l) => s + l.quantity * (l.unit_cost ?? 0),
      0
    );
    entry.totalSpend += poSpend;
  }

  const grandTotal = Array.from(supplierMap.values()).reduce(
    (s, e) => s + e.totalSpend,
    0
  );

  const rows = Array.from(supplierMap.entries())
    .map(([, entry]) => ({
      supplier: entry.name,
      poCount: entry.poIds.size,
      totalSpend: entry.totalSpend,
      pctOfTotal: grandTotal > 0 ? (entry.totalSpend / grandTotal) * 100 : 0,
      avgPoValue: entry.poIds.size > 0 ? entry.totalSpend / entry.poIds.size : 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const headers = [
    "Supplier",
    "POs",
    "Total Spend (AUD)",
    "% of Total",
    "Avg PO Value (AUD)",
  ];

  const lines = rows.map((r) =>
    [
      r.supplier,
      r.poCount,
      r.totalSpend.toFixed(2),
      r.pctOfTotal.toFixed(1),
      r.avgPoValue.toFixed(2),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="spend-by-supplier.csv"',
    },
  });
}
