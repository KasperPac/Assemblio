import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

type PORaw = {
  id: string;
  po_number: string | null;
  expected_date: string | null;
  status: string | null;
  supplier: { name: string } | null;
  lines: { quantity: number; unit_cost: number }[];
};

export async function GET(req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 90);
  const now = new Date();

  const { data } = await supabase
    .from("purchase_order")
    .select("id,po_number,created_at,expected_date,status,supplier:supplier_id(name),lines:purchase_order_line(quantity,unit_cost)")
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const purchaseOrders = (data ?? []) as unknown as PORaw[];

  const headers = ["PO #", "Supplier", "Status", "Expected Date", "Total Value", "Lines", "Overdue"];
  const lines = purchaseOrders.map((po) => {
    const poLines = po.lines ?? [];
    const value = poLines.reduce((s, l) => s + l.quantity * (l.unit_cost ?? 0), 0);
    const overdue = !["received", "cancelled"].includes(po.status ?? "") && !!po.expected_date && new Date(po.expected_date) < now;
    return [po.po_number ?? po.id.slice(0, 8).toUpperCase(), po.supplier?.name ?? "", po.status ?? "", po.expected_date ? new Date(po.expected_date).toLocaleDateString("en-AU") : "", value.toFixed(2), poLines.length, overdue ? "Yes" : "No"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="po-summary.csv"' } });
}
