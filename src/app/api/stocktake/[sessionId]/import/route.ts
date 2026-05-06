import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const vals = parseCSVLine(line);
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

  const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

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

  const updatePromises = rows.map(async (row) => {
    const componentId = row["component_id"]?.trim();
    const countedRaw = row["counted"]?.trim();
    const notes = row["notes"]?.trim() || null;

    if (!componentId || !countedRaw) return 0;
    const counted = Number(countedRaw);
    if (!Number.isFinite(counted) || counted < 0) return 0;

    const lineId = lineByComponentId.get(componentId);
    if (!lineId) return 0;

    await supabase
      .from("stocktake_line")
      .update({ counted, notes, counted_by: user?.id ?? null, counted_at: new Date().toISOString() })
      .eq("id", lineId)
      .eq("session_id", sessionId)
      .eq("tenant_id", tenantId);

    return 1;
  });

  const results = await Promise.all(updatePromises);
  const updated = results.reduce((a: number, b) => a + b, 0);

  return NextResponse.json({ updated });
}
