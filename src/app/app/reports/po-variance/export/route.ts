import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

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

export async function GET(req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
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

  const varianceLines = rawLines.filter(
    (l) => l.quantity_expected !== null && l.quantity_delivered !== l.quantity_expected
  );

  const rows = varianceLines.map((l) => {
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

    const supplier = supplierObj?.name ?? dr?.supplier_name_override ?? "";
    const poNumber = poObj?.id ? poObj.id.slice(0, 8).toUpperCase() : "";
    const component = componentObj?.name ?? "";

    return { poNumber, supplier, component, ordered, received, variance, variancePct };
  });

  const headers = ["PO Number", "Supplier", "Component", "Ordered", "Received", "Variance", "Variance %"];

  const csvLines = rows.map((r) =>
    [
      r.poNumber,
      r.supplier,
      r.component,
      r.ordered,
      r.received,
      r.variance,
      r.variancePct,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...csvLines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="po-variance.csv"',
    },
  });
}
