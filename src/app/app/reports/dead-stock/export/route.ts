import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

type BalanceRaw = {
  component_id: string;
  on_hand: number;
  component: { name: string; sku: string | null; cost_per_unit: number | null } | null;
};

type MovRaw = {
  component_id: string;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const idleThreshold = Number(req.nextUrl.searchParams.get("idle") ?? 90);
  const cutoff = new Date(Date.now() - idleThreshold * 24 * 60 * 60 * 1000).toISOString();

  const { data: balancesRaw } = await supabase.from("inventory_balance").select("component_id,on_hand,component:component_id(name,sku,cost_per_unit)").eq("tenant_id", tenantId).gt("on_hand", 0);
  const { data: recentMovRaw } = await supabase.from("inventory_movement").select("component_id").eq("tenant_id", tenantId).gte("created_at", cutoff);

  const balances = (balancesRaw ?? []) as unknown as BalanceRaw[];
  const recentMov = (recentMovRaw ?? []) as unknown as Pick<MovRaw, "component_id">[];

  const activeIds = new Set(recentMov.map((m) => m.component_id));
  const deadIds = balances.filter((b) => !activeIds.has(b.component_id)).map((b) => b.component_id);

  const lastMovs: Record<string, string> = {};
  if (deadIds.length > 0) {
    const { data } = await supabase.from("inventory_movement").select("component_id,created_at").eq("tenant_id", tenantId).in("component_id", deadIds).order("created_at", { ascending: false });
    for (const m of (data ?? []) as unknown as MovRaw[]) {
      if (!lastMovs[m.component_id]) lastMovs[m.component_id] = m.created_at;
    }
  }

  const now = Date.now();
  const rows = balances.filter((b) => !activeIds.has(b.component_id)).map((b) => {
    const c = b.component;
    const lastMov = lastMovs[b.component_id];
    const daysIdle = lastMov ? Math.floor((now - new Date(lastMov).getTime()) / (24 * 60 * 60 * 1000)) : 999;
    return { name: c?.name ?? "", sku: c?.sku ?? "", on_hand: b.on_hand, value: b.on_hand * (c?.cost_per_unit ?? 0), daysIdle };
  }).sort((a, b) => b.daysIdle - a.daysIdle);

  const headers = ["Component", "SKU", "On Hand", "Value", "Days Idle"];
  const lines = rows.map((r) => [r.name, r.sku, r.on_hand, r.value.toFixed(2), r.daysIdle === 999 ? "never moved" : r.daysIdle].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="dead-stock.csv"' } });
}
