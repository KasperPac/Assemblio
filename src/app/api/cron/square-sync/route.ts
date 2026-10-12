import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorisedCron } from "@/lib/cron/auth";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { isSquarePilotTenant } from "@/lib/square/config";
import { processDueSquareEvents } from "@/lib/square/events";
import { syncSquareTenant } from "@/lib/square/sync";
import type { SquareConnectionRow } from "@/lib/square/connection";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
async function handle(req: Request) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const started = Date.now();
  try {
    const db = createSupabaseAdminClient();
    const events = await processDueSquareEvents(db, 25_000);
    const { data, error } = await db.from("square_connection").select("*").eq("status", "active").order("updated_at");
    assertNoError(error, "Read active Square connections");
    let synced = 0, failed = events.failed;
    for (const conn of (data ?? []) as SquareConnectionRow[]) {
      if (Date.now() - started > 40_000) break;
      if (!isSquarePilotTenant(conn.tenant_id)) continue;
      try { await syncSquareTenant(db, conn); synced++; }
      catch { failed++; }
    }
    return NextResponse.json({ ...events, synced, failed }, { status: failed ? 503 : 200 });
  } catch { return NextResponse.json({ error: "Square reconciliation failed" }, { status: 503 }); }
}
export const GET = handle;
export const POST = handle;
