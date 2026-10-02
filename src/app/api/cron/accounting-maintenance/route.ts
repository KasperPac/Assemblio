// Daily, called by Supabase pg_cron + pg_net. Keeps quiet connections inside Xero's 60-day refresh window.
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshStaleTokens, sendDueAlerts } from "@/lib/accounting/maintenance";
import { appBaseUrl, emailAlertSender } from "@/lib/accounting/alerts";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import { isAuthorisedCron } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
// Hobby-safe. A run killed mid-refresh is safe: the token manager's lease and version check make the next run recover.
export const maxDuration = 60;

function logFailure(step: string, err: unknown) {
  console.error(`[cron] accounting-maintenance ${step} failed`, scrubSecrets(err instanceof Error ? err.message : String(err)));
}

async function handle(req: Request) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  let failed = false;
  let body: Record<string, unknown> = {};
  try {
    const db = createSupabaseAdminClient();
    // Separate try blocks: alerts still run when the refresh pass throws.
    try {
      body = { ...body, ...(await refreshStaleTokens(db)) };
    } catch (err) {
      failed = true;
      logFailure("refresh", err);
    }
    try {
      body = { ...body, ...(await sendDueAlerts(db, { sendAlert: emailAlertSender(db, appBaseUrl()) })) };
    } catch (err) {
      failed = true;
      logFailure("alerts", err);
    }
  } catch (err) {
    failed = true;
    logFailure("setup", err);
  }
  if (failed) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json(body);
}

export const GET = handle;
export const POST = handle;
