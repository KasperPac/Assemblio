// src/lib/accounting/connection.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { readSignedState } from "@/lib/security/signed-state";
import { decryptToken, encryptToken, type TokenKey } from "@/lib/security/token-crypto";
import { isAdminRole } from "@/lib/tenant/authz";
import type { XeroTokenSet } from "./xero/identity";
import { fetchOrganisation } from "./xero/org";
import { scrubSecrets } from "./xero/scrub";
import { sealTokens, type SealedCredential } from "./xero/tokens";

export const STATE_COOKIE = "xero_oauth_nonce";
export const PENDING_COOKIE = "xero_pending";
export const STATE_TTL_MS = 10 * 60_000;
export const PENDING_TTL_MS = 10 * 60_000;
/** Browsers silently drop cookies over ~4096 bytes; stay well under it. */
export const PENDING_COOKIE_MAX = 3800;

/** `secure` cookies are dropped on http://localhost, which would break local OAuth testing. */
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export function settingsUrl(base: string, xero: string, reason?: string): URL {
  const u = new URL("/app/settings/integrations", base);
  u.searchParams.set("xero", xero);
  if (reason) u.searchParams.set("reason", reason);
  return u;
}

export type ConnectionRow = {
  id: string;
  tenant_id: string;
  provider: "xero";
  status: "connected" | "needs_reconnect" | "disconnected";
  external_org_id: string;
  external_connection_id: string;
  org_name: string;
  base_currency: string;
  connected_by: string | null;
  connected_at: string;
  disconnected_at: string | null;
  last_refreshed_at: string | null;
  last_error: string | null;
  last_alert_at: string | null;
  inventory_account_code: string | null;
  other_charges_account_code: string | null;
  purchase_tax_type: string | null;
  gst_free_tax_type: string | null;
  purchase_tax_rate: number | null;
  gst_free_tax_rate: number | null;
  default_amounts_mode: "inclusive" | "exclusive";
  bills_start_date: string | null;
  sales_source: string | null;
  setup_completed_at: string | null;
};

export type PendingOrg = { connectionId: string; tenantId: string; name: string };
export type PendingConnection = { tenantId: string; userId: string; tokens: XeroTokenSet; orgs: PendingOrg[]; exp: number };

export function sealPending(p: PendingConnection, key: TokenKey): string {
  return encryptToken(JSON.stringify(p), key);
}

export function openPending(sealed: string, key: TokenKey, now: number = Date.now()): PendingConnection | null {
  try {
    const p = JSON.parse(decryptToken(sealed, key)) as PendingConnection;
    return p.exp > now ? p : null;
  } catch {
    return null;
  }
}

export type CallbackCheck = { ok: true; tenantId: string; userId: string } | { ok: false; reason: string };

export function validateCallback(input: {
  error: string | null;
  code: string | null;
  state: string | null;
  nonceCookie: string | null;
  session: { tenantId: string | null; userId: string; role: string } | null;
  secret: string;
  now?: number;
}): CallbackCheck {
  if (input.error) {
    if (input.error === "access_denied") return { ok: false, reason: "xero-denied" };
    console.error("[xero] authorise returned an error", scrubSecrets(input.error));
    return { ok: false, reason: "xero-error" };
  }
  if (!input.session) return { ok: false, reason: "no-session" };
  if (!isAdminRole(input.session.role)) return { ok: false, reason: "not-admin" };
  if (!input.code || !input.state) return { ok: false, reason: "bad-state" };
  let read: ReturnType<typeof readSignedState<{ tenantId: string; userId: string; nonce: string }>>;
  try {
    read = readSignedState<{ tenantId: string; userId: string; nonce: string }>(input.state, input.secret, input.now);
  } catch {
    // readSignedState throws on an empty secret; a misconfigured server must redirect, never 500.
    return { ok: false, reason: "not-configured" };
  }
  if (!read.ok) return { ok: false, reason: read.reason === "expired" ? "expired" : "bad-state" };
  if (!input.nonceCookie || read.payload.nonce !== input.nonceCookie) return { ok: false, reason: "nonce-mismatch" };
  if (read.payload.tenantId !== input.session.tenantId || read.payload.userId !== input.session.userId) {
    return { ok: false, reason: "session-mismatch" };
  }
  return { ok: true, tenantId: read.payload.tenantId, userId: read.payload.userId };
}

export type ConnectionUpsert = Partial<ConnectionRow> & Pick<ConnectionRow, "tenant_id" | "provider" | "status" | "external_org_id" | "external_connection_id" | "org_name" | "base_currency">;

export type ConnectionRepo = {
  findByTenant(tenantId: string): Promise<ConnectionRow | null>;
  upsertConnection(row: ConnectionUpsert): Promise<string>;
  upsertCredential(connectionId: string, cred: SealedCredential): Promise<void>;
  markConnected(connectionId: string, userId: string, nowIso: string): Promise<void>;
  cancelOpenJobs(connectionId: string, reason: string): Promise<void>;
  deleteContactLinks(tenantId: string): Promise<void>;
  deleteCredential(connectionId: string): Promise<void>;
  markDisconnected(connectionId: string): Promise<void>;
};

const SETUP_RESET = {
  inventory_account_code: null,
  other_charges_account_code: null,
  purchase_tax_type: null,
  gst_free_tax_type: null,
  purchase_tax_rate: null,
  gst_free_tax_rate: null,
  bills_start_date: null,
  sales_source: null,
  setup_completed_at: null,
};

export async function saveConnection(
  repo: ConnectionRepo,
  args: { tenantId: string; userId: string; org: PendingOrg; baseCurrency: string; tokens: XeroTokenSet; key: TokenKey; now?: number }
): Promise<{ connectionId: string; orgChanged: boolean }> {
  const now = args.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const existing = await repo.findByTenant(args.tenantId);
  const orgChanged = !!existing && existing.external_org_id !== args.org.tenantId;
  if (orgChanged && existing) {
    // Queued work targets the old organisation and its ContactIDs mean nothing in the new one.
    // Do this BEFORE switching the row: if a later write fails, a retry still sees the old
    // organisation and repeats the cleanup, instead of seeing the new one and skipping it.
    await repo.cancelOpenJobs(existing.id, "Xero organisation changed");
    await repo.deleteContactLinks(args.tenantId);
  }
  // Not "connected" until the credential is stored: a failure in between must never read as connected.
  const connectionId = await repo.upsertConnection({
    tenant_id: args.tenantId,
    provider: "xero",
    status: "needs_reconnect",
    external_org_id: args.org.tenantId,
    external_connection_id: args.org.connectionId,
    org_name: args.org.name,
    base_currency: args.baseCurrency,
    disconnected_at: null,
    ...(orgChanged ? SETUP_RESET : {}),
  });
  await repo.upsertCredential(connectionId, sealTokens(args.tokens, args.key, now));
  await repo.markConnected(connectionId, args.userId, nowIso);
  return { connectionId, orgChanged };
}

export async function finishConnection(
  repo: ConnectionRepo,
  args: { tenantId: string; userId: string; org: PendingOrg; tokens: XeroTokenSet; key: TokenKey; fetchImpl?: typeof fetch; now?: number }
): Promise<{ ok: true; connectionId: string; orgChanged: boolean; orgName: string } | { ok: false; reason: string }> {
  const res = await fetchOrganisation({ accessToken: args.tokens.accessToken, xeroTenantId: args.org.tenantId }, args.fetchImpl);
  const org = res.ok ? res.data.Organisations?.[0] : undefined;
  if (!org) {
    console.error(
      "[xero] organisation read failed",
      res.ok ? "no organisation returned" : scrubSecrets({ status: res.status, body: res.body, networkError: res.networkError })
    );
    return { ok: false, reason: "organisation-read" };
  }
  const name = org.Name || args.org.name;
  const saved = await saveConnection(repo, { ...args, org: { ...args.org, name }, baseCurrency: org.BaseCurrency });
  return { ok: true, ...saved, orgName: name };
}

export async function disconnectXero(
  repo: ConnectionRepo,
  deps: {
    connection: { id: string; external_connection_id: string; status?: string };
    getAccessToken: () => Promise<string>;
    readRefreshToken: () => Promise<string | null>;
    revoke: (refreshToken: string) => Promise<boolean>;
    deleteXeroConnection: (accessToken: string, connectionId: string) => Promise<boolean>;
  }
): Promise<{ revokedAtXero: boolean }> {
  let revokedAtXero = false;
  // An already-disconnected row means a previous attempt failed part-way through the local
  // cleanup. The tokens may be gone, so skip Xero and just finish the idempotent cleanup.
  const retry = deps.connection.status === "disconnected";
  if (!retry) {
    try {
      const at = await deps.getAccessToken();
      const deleted = await deps.deleteXeroConnection(at, deps.connection.external_connection_id);
      if (!deleted) console.error("[xero] delete connection was not accepted by Xero");
    } catch (err) {
      console.error("[xero] delete connection failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    }
    try {
      const rt = await deps.readRefreshToken();
      if (rt) {
        revokedAtXero = await deps.revoke(rt);
        if (!revokedAtXero) console.error("[xero] refresh token revocation was not accepted by Xero");
      }
    } catch (err) {
      console.error("[xero] revoke failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    }
    // Mark disconnected first so an in-flight post sees a dead connection before we cancel its jobs.
    // Separate statements on purpose: post_supplier_invoice locks invoice -> receipt lines -> connection,
    // so one transaction touching the connection and then invoices would deadlock with it.
    await repo.markDisconnected(deps.connection.id);
  }
  await repo.cancelOpenJobs(deps.connection.id, "Xero disconnected");
  await repo.deleteCredential(deps.connection.id);
  return { revokedAtXero };
}

export function supabaseConnectionRepo(db: SupabaseClient): ConnectionRepo {
  return {
    async findByTenant(tenantId) {
      const { data, error } = await db.from("accounting_connection").select("*").eq("tenant_id", tenantId).eq("provider", "xero").maybeSingle();
      assertNoError(error, "read accounting_connection");
      return (data as ConnectionRow | null) ?? null;
    },
    async upsertConnection(row) {
      const { data, error } = await db
        .from("accounting_connection")
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,provider" })
        .select("id")
        .single();
      assertNoError(error, "upsert accounting_connection");
      return (data as { id: string }).id;
    },
    async upsertCredential(connectionId, cred) {
      // Never reset version to 1: a refresher that leased an older version must not match the new row.
      const { data: current, error: e1 } = await db.from("accounting_credential").select("version").eq("connection_id", connectionId).maybeSingle();
      assertNoError(e1, "read accounting_credential version");
      const version = ((current as { version: number } | null)?.version ?? 0) + 1;
      const { error } = await db
        .from("accounting_credential")
        .upsert({ connection_id: connectionId, ...cred, version, refresh_lease_until: null, updated_at: new Date().toISOString() }, { onConflict: "connection_id" });
      assertNoError(error, "upsert accounting_credential");
    },
    async markConnected(connectionId, userId, nowIso) {
      const { error } = await db
        .from("accounting_connection")
        .update({ status: "connected", connected_at: nowIso, connected_by: userId, last_refreshed_at: nowIso, last_error: null, disconnected_at: null, updated_at: nowIso })
        .eq("id", connectionId);
      assertNoError(error, "mark accounting_connection connected");
      // Jobs waiting out an auth pause restart their 24-hour retry window, so the pause does not use it up.
      const { error: e2 } = await db
        .from("accounting_outbox")
        .update({ first_attempt_at: null })
        .eq("connection_id", connectionId)
        .or("status.eq.pending,and(status.eq.failed,error_class.eq.transient)");
      assertNoError(e2, "reset accounting_outbox retry window");
    },
    async cancelOpenJobs(connectionId, reason) {
      const { data: cancelled, error } = await db
        .from("accounting_outbox")
        .update({ status: "cancelled", error_message: reason, completed_at: new Date().toISOString(), locked_at: null, locked_by: null })
        .eq("connection_id", connectionId)
        .in("status", ["pending", "working", "failed", "gave_up"])
        .select("id, entity_id, operation, attempts");
      assertNoError(error, "cancel accounting_outbox jobs");
      const rows = (cancelled ?? []) as { id: string; entity_id: string; operation: string; attempts?: number | null }[];
      const creates = rows.filter((r) => r.operation === "create_bill");
      // An attempted create may have reached Xero without its response coming back.
      const attempted = creates.filter((r) => (r.attempts ?? 0) > 0);
      const unattempted = creates.filter((r) => (r.attempts ?? 0) === 0);
      const voidIds = rows.filter((r) => r.operation === "void_bill").map((r) => r.entity_id);
      if (attempted.length) {
        const { error: e1 } = await db
          .from("accounting_outbox")
          .update({ error_message: `${reason}; a bill may already exist in Xero. Check Xero before re-entering.` })
          .in("id", attempted.map((r) => r.id))
          .eq("status", "cancelled");
        assertNoError(e1, "explain cancelled accounting_outbox jobs");
        const { error: e2 } = await db
          .from("supplier_invoice")
          .update({ sync_status: "failed" })
          .in("id", attempted.map((r) => r.entity_id))
          .eq("status", "posted")
          .in("sync_status", ["queued", "failed"]);
        assertNoError(e2, "mark supplier_invoice sync failed");
      }
      if (unattempted.length) {
        // Never attempted: nothing can exist in Xero, so the posted invoice is simply not synced.
        const { error: e3 } = await db
          .from("supplier_invoice")
          .update({ sync_status: "not_synced" })
          .in("id", unattempted.map((r) => r.entity_id))
          .eq("status", "posted")
          .in("sync_status", ["queued", "failed"]);
        assertNoError(e3, "reset supplier_invoice sync_status");
      }
      if (voidIds.length) {
        // The bill still exists in Xero; without this the invoice reads "Voiding in Xero" forever.
        const { error: e4 } = await db
          .from("supplier_invoice")
          .update({ sync_status: "sent" })
          .in("id", voidIds)
          .eq("status", "voided")
          .in("sync_status", ["queued", "failed"])
          .not("external_id", "is", null);
        assertNoError(e4, "reset voided supplier_invoice sync_status");
        // A chase (no external_id) was looking for a bill an earlier create may have made: that bill may exist.
        const { error: e5 } = await db
          .from("supplier_invoice")
          .update({ sync_status: "failed" })
          .in("id", voidIds)
          .eq("status", "voided")
          .eq("sync_status", "queued")
          .is("external_id", null);
        assertNoError(e5, "mark voided supplier_invoice sync failed");
      }
    },
    async deleteContactLinks(tenantId) {
      const { error } = await db.from("accounting_contact_link").delete().eq("tenant_id", tenantId).eq("provider", "xero");
      assertNoError(error, "delete accounting_contact_link");
    },
    async deleteCredential(connectionId) {
      const { error } = await db.from("accounting_credential").delete().eq("connection_id", connectionId);
      assertNoError(error, "delete accounting_credential");
    },
    async markDisconnected(connectionId) {
      const { error } = await db
        .from("accounting_connection")
        .update({ status: "disconnected", disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", connectionId);
      assertNoError(error, "mark accounting_connection disconnected");
    },
  };
}
