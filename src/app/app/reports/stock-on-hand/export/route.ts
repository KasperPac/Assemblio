import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

type BalanceRaw = {
  on_hand: number;
  reserved: number | null;
  in_prod: number | null;
  component: { name: string; sku: string | null; cost_per_unit: number | null; reorder_point: number | null } | null;
  location: { name: string } | null;
};

export async function GET(_req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const { data } = await supabase
    .from("inventory_balance")
    .select("on_hand,reserved,in_prod,component:component_id(name,sku,cost_per_unit,reorder_point),location:location_id(name)")
    .eq("tenant_id", tenantId)
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const balances = (data ?? []) as unknown as BalanceRaw[];

  const headers = ["Component", "SKU", "Location", "On Hand", "Reserved", "In Production", "Value", "Status"];
  const lines = balances.map((r) => {
    const c = r.component;
    const loc = r.location;
    const value = r.on_hand * (c?.cost_per_unit ?? 0);
    const status = r.on_hand === 0 ? "Out" : (c?.reorder_point != null && r.on_hand <= c.reorder_point) ? "Low" : "OK";
    return [c?.name ?? "", c?.sku ?? "", loc?.name ?? "", r.on_hand, r.reserved ?? 0, r.in_prod ?? 0, value.toFixed(2), status]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="stock-on-hand.csv"' },
  });
}
