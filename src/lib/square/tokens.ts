import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, type TokenKey } from "@/lib/security/token-crypto";
import { getSquareConfig, loadSquareTokenKey, squareBaseUrl, type SquareEnvironment } from "./config";
import { refreshSquareTokens, type SquareTokenSet } from "./auth";
import type { SquareAccess, SquareResult } from "./client";

export type SquareCredentialRow = { connection_id: string; access_token_enc: string; refresh_token_enc: string; key_version: number; access_expires_at: string; version: number; refresh_lease_until: string | null };
export type SealedSquareCredential = Pick<SquareCredentialRow, "access_token_enc" | "refresh_token_enc" | "key_version" | "access_expires_at">;
export type SquareCredentialStore = {
  read(id: string): Promise<SquareCredentialRow | null>;
  claimLease(id: string, seconds: number): Promise<SquareCredentialRow | null>;
  writeRefreshed(id: string, version: number, next: SealedSquareCredential, leaseUntil: string | null): Promise<boolean>;
  releaseLease(id: string, version: number, leaseUntil: string | null): Promise<void>;
  markNeedsReconnect(id: string): Promise<void>;
};
export class SquareAuthError extends Error { constructor(message = "Square requires reconnection") { super(message); this.name = "SquareAuthError"; } }
// Normal OAuth access tokens last 30 days. Refresh every 7 days rather than waiting for expiry.
const RENEW_WINDOW_MS = 23 * 86_400_000;
export function sealSquareTokens(tokens: SquareTokenSet, key: TokenKey): SealedSquareCredential {
  return { access_token_enc: encryptToken(tokens.accessToken, key), refresh_token_enc: encryptToken(tokens.refreshToken, key), key_version: key.version, access_expires_at: tokens.expiresAt };
}
export async function getSquareAccessToken(connectionId: string, deps: { store: SquareCredentialStore; key: TokenKey; merchantId: string; refresh: (refreshToken: string) => Promise<SquareResult<SquareTokenSet>>; now?: () => number; sleep?: (ms: number) => Promise<void>; waitTimeoutMs?: number }, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const now = deps.now ?? Date.now;
  const row = await deps.store.read(connectionId);
  if (!row) throw new SquareAuthError("No Square credentials stored");
  if (!opts.forceRefresh && Date.parse(row.access_expires_at) - now() > RENEW_WINDOW_MS) return decryptToken(row.access_token_enc, deps.key);
  const leased = await deps.store.claimLease(connectionId, 60);
  if (!leased) {
    // Bound the number of polls too, so a frozen clock or failing test timer cannot loop forever.
    const polls = Math.ceil((deps.waitTimeoutMs ?? 10_000) / 250);
    for (let i = 0; i < polls; i++) {
      await (deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(250);
      const fresh = await deps.store.read(connectionId);
      if (fresh && fresh.version !== row.version && Date.parse(fresh.access_expires_at) > now()) return decryptToken(fresh.access_token_enc, deps.key);
    }
    throw new Error("Square token refresh is busy; retry later");
  }
  try {
    if (leased.version !== row.version && Date.parse(leased.access_expires_at) > now()) return decryptToken(leased.access_token_enc, deps.key);
    const result = await deps.refresh(decryptToken(leased.refresh_token_enc, deps.key));
    if (!result.ok) {
      if (result.errorClass === "auth") { await deps.store.markNeedsReconnect(connectionId); throw new SquareAuthError(); }
      throw new Error(`Square token refresh failed (${result.errorClass})`);
    }
    if (result.data.merchantId !== deps.merchantId) { await deps.store.markNeedsReconnect(connectionId); throw new SquareAuthError("Square merchant did not match the stored connection"); }
    const written = await deps.store.writeRefreshed(connectionId, leased.version, sealSquareTokens(result.data, deps.key), leased.refresh_lease_until);
    if (!written) throw new Error("Square credentials changed during refresh; retry later");
    return result.data.accessToken;
  } finally { await deps.store.releaseLease(connectionId, leased.version, leased.refresh_lease_until); }
}
export function squareCredentialStore(db: SupabaseClient): SquareCredentialStore {
  return {
    async read(id) {
      const { data, error } = await db.from("square_credential").select("*").eq("connection_id", id).maybeSingle();
      if (error) throw new Error("Square credential read failed");
      return data as SquareCredentialRow | null;
    },
    async claimLease(id, seconds) {
      const { data, error } = await db.rpc("claim_square_refresh_lease", { p_connection_id: id, p_lease_seconds: seconds });
      if (error) throw new Error("Square credential lease failed");
      return (data as SquareCredentialRow[] | null)?.[0] ?? null;
    },
    async writeRefreshed(id, version, next, leaseUntil) {
      let query = db.from("square_credential").update({ ...next, version: version + 1, refresh_lease_until: null }).eq("connection_id", id).eq("version", version);
      query = leaseUntil === null ? query.is("refresh_lease_until", null) : query.eq("refresh_lease_until", leaseUntil);
      const { data, error } = await query.select("connection_id");
      if (error) throw new Error("Square credential update failed");
      return data?.length === 1;
    },
    async releaseLease(id, version, leaseUntil) {
      let query = db.from("square_credential").update({ refresh_lease_until: null }).eq("connection_id", id).eq("version", version);
      query = leaseUntil === null ? query.is("refresh_lease_until", null) : query.eq("refresh_lease_until", leaseUntil);
      const { error } = await query;
      if (error) throw new Error("Square credential lease release failed");
    },
    async markNeedsReconnect(id) {
      const { error } = await db.from("square_connection").update({ status: "needs_reconnect", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "active");
      if (error) throw new Error("Square connection status update failed");
    },
  };
}
/** Service-role only; recheck tenant/status before exposing credentials to a caller. */
export async function getSquareAccess(db: SupabaseClient, connection: { id: string; tenant_id: string; environment: SquareEnvironment; status: string }, opts: { forceRefresh?: boolean } = {}): Promise<SquareAccess> {
  const { data, error } = await db.from("square_connection").select("id,merchant_id,environment,status").eq("id", connection.id).eq("tenant_id", connection.tenant_id).maybeSingle();
  if (error) throw new Error("Square connection lookup failed");
  if (!data || data.status !== "active" || data.environment !== connection.environment) throw new SquareAuthError();
  const cfg = getSquareConfig();
  if (!cfg.ok || cfg.environment !== data.environment) throw new Error("Square application configuration does not match the connection environment");
  const accessToken = await getSquareAccessToken(connection.id, { store: squareCredentialStore(db), key: loadSquareTokenKey(), merchantId: data.merchant_id, refresh: (rt) => refreshSquareTokens(cfg, rt) }, opts);
  return { baseUrl: squareBaseUrl(connection.environment), accessToken };
}
