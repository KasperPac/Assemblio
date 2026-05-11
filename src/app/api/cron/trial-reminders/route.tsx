import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import {
  runReminderSweep,
  type ReminderKind,
  type TemplateBuilder,
} from "@/lib/subscription/reminders";
import { TrialReminder3 } from "@/lib/email/templates/trial-reminder-3";
import { TrialReminder1 } from "@/lib/email/templates/trial-reminder-1";
import { TrialExpired } from "@/lib/email/templates/trial-expired";

function checkAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function paywallUrl(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/app/billing/paywall`;
}

const TEMPLATES: Record<ReminderKind, TemplateBuilder> = {
  t_minus_3: ({ tenantName, to }) => ({
    to,
    subject: "3 days left in your Manuva trial",
    react: <TrialReminder3 tenantName={tenantName} paywallUrl={paywallUrl()} />,
  }),
  t_minus_1: ({ tenantName, to }) => ({
    to,
    subject: "Your Manuva trial ends tomorrow",
    react: <TrialReminder1 tenantName={tenantName} paywallUrl={paywallUrl()} />,
  }),
  expired: ({ tenantName, to }) => ({
    to,
    subject: "Your Manuva trial has ended",
    react: <TrialExpired tenantName={tenantName} paywallUrl={paywallUrl()} />,
  }),
};

async function handle(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const result = await runReminderSweep({
    admin,
    send: sendEmail,
    now: new Date(),
    templates: TEMPLATES,
  });
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
