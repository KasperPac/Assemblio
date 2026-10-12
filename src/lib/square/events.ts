import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { getSquareConfig, isSquarePilotTenant } from "./config";
import { syncSquareTenant } from "./sync";
import type { SquareConnectionRow } from "./connection";

const supported = new Set(["order.created", "order.updated", "order.fulfillment.updated", "catalog.version.updated", "inventory.count.updated", "oauth.authorization.revoked"]);

/** Store only routing metadata, not a raw buyer/payment payload. Fetch current objects in the worker. */
export function squareEventEnvelope(payload: Record<string, unknown>) {
  if (typeof payload.event_id !== "string" || !payload.event_id || typeof payload.merchant_id !== "string" || !payload.merchant_id || typeof payload.type !== "string" || !payload.type) throw new Error("Invalid Square event identity");
  return { event_id: payload.event_id, merchant_id: payload.merchant_id, type: payload.type };
}

export async function processSquareWebhook(db: SupabaseClient, payload: Record<string, unknown>): Promise<{ stored: boolean }> {
  const event = squareEventEnvelope(payload);
  if (!supported.has(event.type)) return { stored: false };
  const config = getSquareConfig();
  if (!config.ok) throw new Error("Square application is not configured");
  const { data: connection, error } = await db.from("square_connection").select("id,tenant_id,sales_channel_id,status").eq("merchant_id", event.merchant_id).eq("environment", config.environment).maybeSingle();
  assertNoError(error, "Resolve Square event tenant");
  if (!connection || connection.status === "disconnected" || !isSquarePilotTenant(connection.tenant_id)) return { stored: false };
  const { error: insertError } = await db.from("square_webhook_event").upsert({ tenant_id: connection.tenant_id, sales_channel_id: connection.sales_channel_id,
    event_id: event.event_id, event_type: event.type, payload: event }, { onConflict: "event_id", ignoreDuplicates: true });
  assertNoError(insertError, "Persist Square event");
  return { stored: true };
}

type SquareEventRow = { id: string; tenant_id: string; sales_channel_id: string; event_type: string; attempts: number; lease_until: string };
export async function processDueSquareEvents(db: SupabaseClient, budgetMs = 40_000) {
  const started = Date.now();
  const { data, error } = await db.rpc("claim_square_webhook_events", { p_limit: 10 });
  assertNoError(error, "Claim Square events");
  const rows = (data ?? []) as SquareEventRow[];
  const outcomes = new Map<string, boolean>();
  let processed = 0, failed = 0;
  for (const row of rows) {
    if (Date.now() - started > budgetMs) break;
    let ok = false;
    try {
      const { data: conn, error: connectionError } = await db.from("square_connection").select("*").eq("tenant_id", row.tenant_id).eq("sales_channel_id", row.sales_channel_id).maybeSingle();
      assertNoError(connectionError, "Read event connection");
      if (!conn || !isSquarePilotTenant(row.tenant_id)) throw new Error("Square event is unavailable");
      if (row.event_type === "oauth.authorization.revoked") {
        const { error: revokeError } = await db.rpc("square_disconnect", { p_tenant_id: row.tenant_id, p_connection_id: conn.id });
        assertNoError(revokeError, "Record Square access revocation"); ok = true;
      } else if (outcomes.has(row.sales_channel_id)) ok = outcomes.get(row.sales_channel_id)!;
      else { await syncSquareTenant(db, conn as SquareConnectionRow); ok = true; outcomes.set(row.sales_channel_id, true); }
    } catch { outcomes.set(row.sales_channel_id, false); }
    const { data: saved, error: outcomeError } = await db.from("square_webhook_event").update({ status: ok ? "processed" : "failed", last_error: ok ? null : "Square reconciliation failed; retry or reconnect",
      lease_until: ok ? null : new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(row.attempts, 6)) * 1000).toISOString(), updated_at: new Date().toISOString() })
      .eq("tenant_id", row.tenant_id).eq("sales_channel_id", row.sales_channel_id).eq("id", row.id).eq("lease_until", row.lease_until).select("id");
    assertNoError(outcomeError, "Record Square event outcome");
    if (saved?.length) { if (ok) processed++; else failed++; }
  }
  return { processed, failed };
}
