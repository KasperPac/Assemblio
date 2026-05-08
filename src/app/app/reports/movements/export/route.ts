import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

type MovementRaw = {
  id: string;
  created_at: string;
  delta_on_hand: number;
  reason: string | null;
  reference_type: string | null;
  component: { name: string } | null;
};

export async function GET(req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 30);

  const { data } = await supabase
    .from("inventory_movement")
    .select("id,created_at,delta_on_hand,reason,reference_type,component:component_id(name)")
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const movements = (data ?? []) as unknown as MovementRaw[];

  const headers = ["Date", "Component", "Type", "Reference", "Qty"];
  const lines = movements.map((m) => {
    return [new Date(m.created_at).toLocaleDateString("en-AU"), m.component?.name ?? "", m.reason ?? m.reference_type ?? "adjustment", m.reference_type ?? "", m.delta_on_hand]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="movements.csv"' },
  });
}
