import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

type BalanceRaw = {
  component_id: string;
  on_hand: number;
  in_prod: number | null;
  reserved: number | null;
  component: { name: string; sku: string | null; cost_per_unit: number | null } | null;
};

export async function GET(_req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const { data } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand,in_prod,reserved,component:component_id(name,sku,cost_per_unit)")
    .eq("tenant_id", tenantId)
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const rows = (data ?? []) as unknown as BalanceRaw[];
  const totalValue = rows.reduce((s, b) => s + b.on_hand * (b.component?.cost_per_unit ?? 0), 0);

  const headers = ["Component", "SKU", "On Hand", "Cost Per Unit", "Total Value", "% of Total"];
  const lines = rows.map((b) => {
    const c = b.component;
    const value = b.on_hand * (c?.cost_per_unit ?? 0);
    const pct = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0.0";
    return [c?.name ?? "", c?.sku ?? "", b.on_hand, (c?.cost_per_unit ?? 0).toFixed(2), value.toFixed(2), pct]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="inventory-valuation.csv"' },
  });
}
