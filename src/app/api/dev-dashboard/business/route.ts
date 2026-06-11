import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TIER_MONTHLY_PRICE } from "@/lib/dev-dashboard/types";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const supabase = await createSupabaseServerClient();

  const [
    { data: tenants },
    { data: subs },
    { count: bomTenants },
    { count: poTenants },
    { count: stocktakeTenants },
    { data: planningTenants },
    { data: multiLocTenants },
  ] = await Promise.all([
    supabase.from("tenant").select("id, created_at, deleted_at, suspended_at"),
    supabase.from("tenant_subscription").select("tenant_id, selected_tier, status, billing_interval"),
    supabase.from("bom").select("tenant_id", { count: "exact", head: true }).limit(1),
    supabase.from("purchase_order").select("tenant_id", { count: "exact", head: true }).limit(1),
    supabase.from("stocktake_session").select("tenant_id", { count: "exact", head: true }).limit(1),
    supabase.from("tenant").select("id").eq("has_planning_module", true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.rpc("count_multi_location_tenants" as any),
  ]);

  // Suppress unused variable warnings — these counts are reserved for future use
  void bomTenants;
  void poTenants;
  void stocktakeTenants;

  const allTenants = tenants ?? [];
  const allSubs = subs ?? [];
  const totalTenants = allTenants.length;
  const activeTenants = allTenants.filter((t) => !t.deleted_at && !t.suspended_at).length;

  // Status breakdown
  const subByTenant = new Map(allSubs.map((s) => [s.tenant_id, s]));
  const statusCounts: Record<string, number> = { trialing: 0, active: 0, past_due: 0, canceled: 0, deleted: 0 };
  for (const t of allTenants) {
    if (t.deleted_at) { statusCounts.deleted++; continue; }
    const sub = subByTenant.get(t.id);
    const status = sub?.status ?? "trialing";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  // MRR calculation
  let mrr = 0;
  const tierCounts: Record<string, { count: number; mrr: number }> = {};
  for (const sub of allSubs) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;
    const interval = sub.billing_interval ?? "monthly";
    const price = TIER_MONTHLY_PRICE[sub.selected_tier]?.[interval] ?? 0;
    mrr += price;
    if (!tierCounts[sub.selected_tier]) tierCounts[sub.selected_tier] = { count: 0, mrr: 0 };
    tierCounts[sub.selected_tier].count++;
    tierCounts[sub.selected_tier].mrr += price;
  }

  const arpu = activeTenants > 0 ? Math.round(mrr / activeTenants) : 0;

  // Trial conversion: count of tenants that were trialing and are now active / total that trialed
  const trialedCount = allSubs.length;
  const convertedCount = allSubs.filter((s) => s.status === "active").length;
  const trialConversion = trialedCount > 0 ? Math.round((convertedCount / trialedCount) * 100) : 0;

  // Churn: deleted in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentlyDeleted = allTenants.filter((t) => t.deleted_at && t.deleted_at >= thirtyDaysAgo).length;
  const churnRate = totalTenants > 0 ? Number(((recentlyDeleted / totalTenants) * 100).toFixed(1)) : 0;

  // Signups by week (last 12 weeks)
  const weeks: { week: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date();
    end.setDate(end.getDate() - i * 7);
    const label = start.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    const count = allTenants.filter((t) => {
      const d = new Date(t.created_at);
      return d >= start && d < end;
    }).length;
    weeks.push({ week: label, count });
  }

  // Feature adoption (% of active tenants)
  // For BOM, PO, stocktake: we need distinct tenant counts, not just existence.
  // Use distinct tenant_id counts via RPC helper.
  const [
    { data: bomDistinct },
    { data: poDistinct },
    { data: stocktakeDistinct },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.rpc("count_distinct_tenants" as any, { p_table: "bom" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.rpc("count_distinct_tenants" as any, { p_table: "purchase_order" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.rpc("count_distinct_tenants" as any, { p_table: "stocktake_session" }),
  ]);

  const pct = (n: number) => activeTenants > 0 ? Math.round((n / activeTenants) * 100) : 0;

  const featureAdoption = [
    { feature: "Bills of Materials", percent: pct(Number(bomDistinct ?? 0)) },
    { feature: "Purchasing", percent: pct(Number(poDistinct ?? 0)) },
    { feature: "Stocktake", percent: pct(Number(stocktakeDistinct ?? 0)) },
    { feature: "Production Planning", percent: pct((planningTenants ?? []).length) },
    { feature: "Multi-location", percent: pct(Number(multiLocTenants ?? 0)) },
  ];

  return NextResponse.json({
    tenantsByStatus: statusCounts,
    signupsByWeek: weeks,
    mrr,
    arpu,
    trialConversion,
    churnRate,
    revenueByTier: Object.entries(tierCounts).map(([tier, v]) => ({ tier, ...v })),
    featureAdoption,
  });
}
