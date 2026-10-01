import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { xeroAccessFor } from "./xero/access";
import { scrubSecrets } from "./xero/scrub";

export const REFRESH_EVERY_MS = 7 * 86_400_000;
export const ALERT_EVERY_MS = 86_400_000;
const PROBLEM_WINDOW_MS = 7 * 86_400_000;

export type MaintenanceConnection = {
  id: string; tenant_id: string; external_org_id: string; org_name: string; status: string;
  connected_by: string | null; last_refreshed_at: string | null; last_alert_at: string | null;
};
export type AlertSender = (c: MaintenanceConnection, kind: "reconnect" | "failed", problemJobs: number) => Promise<boolean>;

export function isRefreshDue(c: Pick<MaintenanceConnection, "status" | "last_refreshed_at">, now: Date): boolean {
  return c.status === "connected" && (!c.last_refreshed_at || now.getTime() - Date.parse(c.last_refreshed_at) > REFRESH_EVERY_MS);
}

export function alertKind(c: MaintenanceConnection, problemJobs: number, now: Date): "reconnect" | "failed" | null {
  if (!c.connected_by) return null;
  if (c.last_alert_at && now.getTime() - Date.parse(c.last_alert_at) < ALERT_EVERY_MS) return null;
  if (c.status === "needs_reconnect") return "reconnect";
  if (c.status === "connected" && problemJobs > 0) return "failed";
  return null;
}

async function liveConnections(db: SupabaseClient): Promise<MaintenanceConnection[]> {
  const { data, error } = await db
    .from("accounting_connection")
    .select("id, tenant_id, external_org_id, org_name, status, connected_by, last_refreshed_at, last_alert_at")
    .neq("status", "disconnected");
  assertNoError(error, "list accounting connections");
  return (data ?? []) as MaintenanceConnection[];
}

export async function refreshStaleTokens(
  db: SupabaseClient,
  deps: { now?: () => Date; refresh?: (c: MaintenanceConnection) => Promise<void> } = {}
): Promise<{ refreshed: number; refreshFailed: number }> {
  const now = deps.now ?? (() => new Date());
  const refresh = deps.refresh ?? (async (c) => { await xeroAccessFor(db, c, { forceRefresh: true }); });
  const out = { refreshed: 0, refreshFailed: 0 };
  for (const c of await liveConnections(db)) {
    if (!isRefreshDue(c, now())) continue;
    try {
      await refresh(c);
      out.refreshed++;
    } catch (err) {
      // An invalid_grant has already marked the connection needs_reconnect; sendDueAlerts emails about it.
      // One connection's failure never stops the others.
      out.refreshFailed++;
      console.error("[xero] scheduled refresh failed", c.id, scrubSecrets(err instanceof Error ? err.message : String(err)));
    }
  }
  return out;
}

/**
 * Spec 3.7: email only on needs_reconnect and on a job that gave up. Fixable
 * failures are covered by the in-app banner, so they are deliberately not counted.
 */
export async function sendDueAlerts(db: SupabaseClient, deps: { sendAlert: AlertSender; now?: () => Date }): Promise<{ alerted: number }> {
  const now = deps.now ?? (() => new Date());
  let alerted = 0;
  for (const c of await liveConnections(db)) {
    const since = new Date(now().getTime() - PROBLEM_WINDOW_MS).toISOString();
    const { count, error } = await db
      .from("accounting_outbox")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", c.id)
      .eq("status", "gave_up")
      .gte("created_at", since);
    assertNoError(error, "count problem jobs");
    const kind = alertKind(c, count ?? 0, now());
    if (!kind) continue;
    if (await deps.sendAlert(c, kind, count ?? 0)) {
      const { error: ue } = await db.from("accounting_connection").update({ last_alert_at: now().toISOString() }).eq("id", c.id);
      assertNoError(ue, "record alert sent");
      alerted++;
    }
  }
  return { alerted };
}
