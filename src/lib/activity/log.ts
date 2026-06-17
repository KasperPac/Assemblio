import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerTenantContext } from "@/lib/tenant/context";
import { buildActivityRow } from "./build";
import type { ActivityEvent, ActivityActorType } from "./events";

type LogActivityInput = {
  event: ActivityEvent;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Log a user-initiated activity. Resolves actor + tenant from the request context.
 * Never throws — a logging failure must not break the business action.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const ctx = await getServerTenantContext();
    if (!ctx || !ctx.tenantId) return;

    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();

    let actorLabel = (profile as { full_name?: string | null } | null)?.full_name ?? null;
    if (!actorLabel) {
      const { data } = await ctx.supabase.auth.getUser();
      actorLabel = data.user?.email ?? null;
    }

    const row = buildActivityRow({
      event: input.event,
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorType: "user",
      actorLabel,
      entityId: input.entityId,
      metadata: input.metadata,
    });

    await ctx.supabase.from("activity_log").insert(row);
  } catch (err) {
    console.error("[activity] logActivity failed", input.event, err);
  }
}

type LogSystemActivityInput = {
  supabase: SupabaseClient;
  tenantId: string;
  event: ActivityEvent;
  actorType: Exclude<ActivityActorType, "user">;
  actorLabel: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Log an automated/system activity (Shopify sync, Stripe billing, scheduled jobs).
 * Caller supplies the admin client + tenant explicitly. Never throws.
 */
export async function logSystemActivity(input: LogSystemActivityInput): Promise<void> {
  try {
    const row = buildActivityRow({
      event: input.event,
      tenantId: input.tenantId,
      actorId: null,
      actorType: input.actorType,
      actorLabel: input.actorLabel,
      entityId: input.entityId,
      metadata: input.metadata,
    });
    await input.supabase.from("activity_log").insert(row);
  } catch (err) {
    console.error("[activity] logSystemActivity failed", input.event, err);
  }
}
