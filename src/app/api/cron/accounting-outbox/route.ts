// Every 5 minutes, called by Supabase pg_cron + pg_net (see
// supabase/patches/2026-10-01-xero-cron-schedule.sql). The Vercel team is on Hobby, so Vercel Cron can't run this often.
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processDueOutboxes } from "@/lib/accounting/outbox/process";
import { sendDueAlerts } from "@/lib/accounting/maintenance";
import { appBaseUrl, emailAlertSender } from "@/lib/accounting/alerts";
import { isAuthorisedCron } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
// Hobby-safe. A run killed mid-job is safe: the claim counts a reclaim as an attempt, which forces the duplicate search.
export const maxDuration = 60;

async function handle(req: Request) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const outbox = await processDueOutboxes({ db }, 40_000);
  const alerts = await sendDueAlerts(db, { sendAlert: emailAlertSender(db, appBaseUrl()) });
  return NextResponse.json({ ...outbox, ...alerts });
}

export const GET = handle;
export const POST = handle;
