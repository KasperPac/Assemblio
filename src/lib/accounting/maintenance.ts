import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { xeroAccessFor } from "./xero/access";
import { scrubSecrets } from "./xero/scrub";

export const REFRESH_EVERY_MS = 7 * 86_400_000;
export const ALERT_EVERY_MS = 86_400_000;

export type MaintenanceConnection = {
  id: string; tenant_id: string; external_org_id: string; org_name: string; status: string;
  connected_by: string | null; last_refreshed_at: string | null; last_alert_at: string | null; updated_at: string;
};
export type AlertSender = (c: MaintenanceConnection, kind: "reconnect" | "failed", problemJobs: number) => Promise<boolean>;

export function isRefreshDue(c: Pick<MaintenanceConnection, "status" | "last_refreshed_at">, now: Date): boolean {
  return c.status === "connected" && (!c.last_refreshed_at || now.getTime() - Date.parse(c.last_refreshed_at) > REFRESH_EVERY_MS);
}

/**
 * Alerts fire on transitions (spec 3.7), not as a daily nag.
 * - reconnect: the connection flipped to needs_reconnect after the last alert (markNeedsReconnect stamps updated_at).
 * - failed: `problemJobs` is the number of jobs that gave up since the last alert.
 * A transition inside the 24h window is picked up once the window passes.
 */
export function alertKind(c: MaintenanceConnection, problemJobs: number, now: Date): "reconnect" | "failed" | null {
  if (!c.connected_by) return null;
  if (c.last_alert_at && now.getTime() - Date.parse(c.last_alert_at) < ALERT_EVERY_MS) return null;
  if (c.status === "needs_reconnect") {
    return !c.last_alert_at || Date.parse(c.last_alert_at) < Date.parse(c.updated_at) ? "reconnect" : null;
  }
  if (c.status === "connected" && problemJobs > 0) return "failed";
  return null;
}

async function liveConnections(db: SupabaseClient): Promise<MaintenanceConnection[]> {
  const { data, error } = await db
    .from("accounting_connection")
    .select("id, tenant_id, external_org_id, org_name, status, connected_by, last_refreshed_at, last_alert_at, updated_at")
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
 * Spec 3.7: email only on a transition to needs_reconnect and on a job that gave up.
 * Fixable failures are covered by the in-app banner, so they are deliberately not counted.
 *
 * The throttle (last_alert_at) is claimed BEFORE sending, so at most one email per
 * connection per 24h holds even if later writes fail. A failed send restores the
 * previous value so it retries. One connection's failure never stops the others.
 */
export async function sendDueAlerts(
  db: SupabaseClient,
  deps: { sendAlert: AlertSender; now?: () => Date }
): Promise<{ alerted: number; failed: number }> {
  const now = deps.now ?? (() => new Date());
  const out = { alerted: 0, failed: 0 };
  for (const c of await liveConnections(db)) {
    try {
      let q = db
        .from("accounting_outbox")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", c.id)
        .eq("status", "gave_up");
      if (c.last_alert_at) q = q.gt("completed_at", c.last_alert_at);
      const { count, error } = await q;
      assertNoError(error, "count problem jobs");
      const kind = alertKind(c, count ?? 0, now());
      if (!kind) continue;

      const { error: ce } = await db.from("accounting_connection").update({ last_alert_at: now().toISOString() }).eq("id", c.id);
      assertNoError(ce, "claim alert throttle");

      let sent = false;
      try {
        sent = await deps.sendAlert(c, kind, count ?? 0);
      } finally {
        if (!sent) await restoreThrottle(db, c);
      }
      if (sent) out.alerted++;
    } catch (err) {
      out.failed++;
      console.error("[xero] alert failed", c.id, scrubSecrets(err instanceof Error ? err.message : String(err)));
    }
  }
  return out;
}

async function restoreThrottle(db: SupabaseClient, c: MaintenanceConnection): Promise<void> {
  try {
    const { error } = await db.from("accounting_connection").update({ last_alert_at: c.last_alert_at }).eq("id", c.id);
    if (error) console.error("[xero] could not restore alert throttle", c.id, scrubSecrets(error.message));
  } catch (err) {
    console.error("[xero] could not restore alert throttle", c.id, scrubSecrets(err instanceof Error ? err.message : String(err)));
  }
}
