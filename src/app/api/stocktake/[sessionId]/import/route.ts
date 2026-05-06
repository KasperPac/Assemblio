import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).filter(Boolean).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId } = context;

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const session = sessionData as { id: string; status: string } | null;
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status !== "counting" && session.status !== "open") {
    return NextResponse.json({ error: "Session is not in counting status" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);

  const { data: existingLines } = await supabase
    .from("stocktake_line")
    .select("id,component_id")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId);

  const lineByComponentId = new Map(
    ((existingLines ?? []) as { id: string; component_id: string }[]).map((l) => [l.component_id, l.id])
  );

  const { data: { user } } = await supabase.auth.getUser();

  let updated = 0;
  for (const row of rows) {
    const componentId = row["component_id"]?.trim();
    const countedRaw = row["counted"]?.trim();
    const notes = row["notes"]?.trim() || null;

    if (!componentId || countedRaw === "" || countedRaw === undefined) continue;
    const counted = Number(countedRaw);
    if (!Number.isFinite(counted) || counted < 0) continue;

    const lineId = lineByComponentId.get(componentId);
    if (!lineId) continue;

    await supabase
      .from("stocktake_line")
      .update({ counted, notes, counted_by: user?.id ?? null, counted_at: new Date().toISOString() })
      .eq("id", lineId)
      .eq("session_id", sessionId)
      .eq("tenant_id", tenantId);

    updated++;
  }

  return NextResponse.json({ updated });
}
