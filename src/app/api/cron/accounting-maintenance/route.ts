// Daily, called by Supabase pg_cron + pg_net. Keeps quiet connections inside Xero's 60-day refresh window.
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshStaleTokens, sendDueAlerts } from "@/lib/accounting/maintenance";
import { appBaseUrl, emailAlertSender } from "@/lib/accounting/alerts";
import { isAuthorisedCron } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
// Hobby-safe. A run killed mid-refresh is safe: the token manager's lease and version check make the next run recover.
export const maxDuration = 60;

async function handle(req: Request) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const refreshed = await refreshStaleTokens(db);
  const alerts = await sendDueAlerts(db, { sendAlert: emailAlertSender(db, appBaseUrl()) });
  return NextResponse.json({ ...refreshed, ...alerts });
}

export const GET = handle;
export const POST = handle;
