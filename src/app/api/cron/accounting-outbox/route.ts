// Every 5 minutes, called by Supabase pg_cron + pg_net (see
// supabase/patches/2026-10-01-xero-cron-schedule.sql). The Vercel team is on Hobby, so Vercel Cron can't run this often.
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processDueOutboxes } from "@/lib/accounting/outbox/process";
import { sendDueAlerts } from "@/lib/accounting/maintenance";
import { appBaseUrl, emailAlertSender } from "@/lib/accounting/alerts";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import { isAuthorisedCron } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
// Hobby-safe. A run killed mid-job is safe: the claim counts a reclaim as an attempt, which forces the duplicate search.
export const maxDuration = 60;

function logFailure(step: string, err: unknown) {
  console.error(`[cron] accounting-outbox ${step} failed`, scrubSecrets(err instanceof Error ? err.message : String(err)));
}

async function handle(req: Request) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  let failed = false;
  let body: Record<string, unknown> = {};
  try {
    const db = createSupabaseAdminClient();
    // Separate try blocks: alerts still run when the outbox pass throws.
    try {
      body = { ...body, ...(await processDueOutboxes({ db }, 40_000)) };
    } catch (err) {
      failed = true;
      logFailure("outbox", err);
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
