import type { SupabaseClient } from "@supabase/supabase-js";
import type { sendEmail } from "../email/send";

export type ReminderKind = "t_minus_3" | "t_minus_1" | "expired";

export function classifyDaysLeft(daysUntilEnd: number): ReminderKind | null {
  if (daysUntilEnd === 3) return "t_minus_3";
  if (daysUntilEnd === 1) return "t_minus_1";
  if (daysUntilEnd <= 0 && daysUntilEnd >= -1) return "expired";
  return null;
}

export type SendArgs = Parameters<typeof sendEmail>[0];

export type TemplateBuilder = (args: {
  tenantName: string;
  to: string;
}) => SendArgs;

export interface ReminderDeps {
  admin: SupabaseClient;
  send: typeof sendEmail;
  now: Date;
  templates: Record<ReminderKind, TemplateBuilder>;
}

export interface ReminderResult {
  sent: number;
  skipped: number;
}

const PG_UNIQUE_VIOLATION = "23505";

export async function runReminderSweep(
  deps: ReminderDeps
): Promise<ReminderResult> {
  let sent = 0;
  let skipped = 0;

  const { data: subs, error } = await deps.admin
    .from("tenant_subscription")
    .select("tenant_id, trial_ends_at, tenant:tenant_id(name)")
    .eq("status", "trialing");
  if (error) throw error;

  for (const sub of subs ?? []) {
    const trialEndsRaw = (sub as { trial_ends_at: string }).trial_ends_at;
    const trialEnds = new Date(trialEndsRaw);
    if (isNaN(trialEnds.getTime())) {
      skipped++;
      continue;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    const daysUntilEnd = Math.floor(
      (trialEnds.getTime() - deps.now.getTime()) / dayMs
    );
    const kind = classifyDaysLeft(daysUntilEnd);
    if (!kind) {
      skipped++;
      continue;
    }

    const tenantId = (sub as { tenant_id: string }).tenant_id;
    const { error: logError } = await deps.admin
      .from("trial_email_log")
      .insert({ tenant_id: tenantId, kind });
    if (logError) {
      const code =
        typeof logError === "object" && logError !== null
          ? (logError as { code?: string }).code
          : undefined;
      if (code !== PG_UNIQUE_VIOLATION) {
        console.error(
          `[reminders] trial_email_log insert failed for tenant ${tenantId} (${kind})`,
          logError
        );
      }
      skipped++;
      continue;
    }

    const { data: ownerProfile } = await deps.admin
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (!ownerProfile) {
      skipped++;
      continue;
    }

    const ownerId = (ownerProfile as { id: string }).id;
    const userResult = await deps.admin.auth.admin.getUserById(ownerId);
    const email = userResult?.data?.user?.email;
    if (!email) {
      skipped++;
      continue;
    }

    const tenantRel = (sub as { tenant?: { name?: string } | { name?: string }[] }).tenant;
    const tenantName = Array.isArray(tenantRel)
      ? tenantRel[0]?.name ?? "your workspace"
      : tenantRel?.name ?? "your workspace";

    const sendArgs = deps.templates[kind]({ tenantName, to: email });
    const res = await deps.send(sendArgs);
    if (res.ok) sent++;
    else skipped++;
  }

  return { sent, skipped };
}
