import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveDateRange } from "../../_lib/date-range";

type SessionRaw = {
  id: string;
  created_at: string;
  status: string | null;
  location: { name: string } | null;
  lines: { expected_on_hand: number; counted: number }[];
};

export async function GET(req: NextRequest) {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = resolveDateRange(sp, 365);

  const { data: sessionsRaw } = await supabase
    .from("stocktake_session")
    .select("id,created_at,status,location:location_id(name),lines:stocktake_line(id,expected_on_hand,counted)")
    .eq("tenant_id", tenantId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false });

  const sessions = (sessionsRaw ?? []) as unknown as SessionRaw[];

  const headers = ["Date", "Location", "Status", "Lines Counted", "Variance Lines", "Total Variance Qty"];
  const lines = sessions.map((s) => {
    const slines = s.lines ?? [];
    const varLines = slines.filter((l) => l.counted !== l.expected_on_hand);
    const varQty = varLines.reduce((sum, l) => sum + Math.abs(l.counted - l.expected_on_hand), 0);
    return [new Date(s.created_at).toLocaleDateString("en-AU"), s.location?.name ?? "", s.status ?? "", slines.length, varLines.length, varQty]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [headers.join(","), ...lines].join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="stocktake-history.csv"' } });
}
