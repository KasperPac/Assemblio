import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

type LineRow = {
  id: string;
  expected_on_hand: number;
  counted: number | null;
  notes: string | null;
  component: {
    id: string;
    name: string | null;
    sku: string | null;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  } | Array<{
    id: string;
    name: string | null;
    sku: string | null;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  }> | null;
};

function csvEscape(val: string | null | undefined): string {
  const s = val ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId } = context;

  const { data: lines, error: linesError } = await supabase
    .from("stocktake_line")
    .select("id,expected_on_hand,counted,notes,component:component_id(id,name,sku,bin_sub_location,bin_row,bin_bay)")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId);

  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("reference_number")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const rows = (lines ?? []) as LineRow[];
  rows.sort((a, b) => {
    const ca = Array.isArray(a.component) ? a.component[0] : a.component;
    const cb = Array.isArray(b.component) ? b.component[0] : b.component;
    return (ca?.name ?? "").localeCompare(cb?.name ?? "");
  });

  const header = "component_id,component_name,sku,sub_location,row,bay,expected,counted,notes\r\n";
  const body = rows.map((l) => {
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    return [
      csvEscape(c?.id),
      csvEscape(c?.name),
      csvEscape(c?.sku),
      csvEscape(c?.bin_sub_location),
      csvEscape(c?.bin_row),
      csvEscape(c?.bin_bay),
      String(Number(l.expected_on_hand).toFixed(0)),
      l.counted !== null ? String(Number(l.counted).toFixed(0)) : "",
      csvEscape(l.notes),
    ].join(",");
  }).join("\r\n");

  const ref = (sessionData as { reference_number: string | null } | null)?.reference_number ?? sessionId.slice(0, 8);

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${ref}-stocktake.csv"`,
    },
  });
}
