// src/lib/accounting/xero/tokens.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { decryptToken, encryptToken, type TokenKey } from "@/lib/security/token-crypto";
import type { TokenResult, XeroTokenSet } from "./identity";
import { scrubSecrets } from "./scrub";

export type CredentialRow = {
  connection_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  key_version: number;
  access_expires_at: string;
  refresh_expires_at: string;
  refresh_lease_until: string | null;
  version: number;
};
export type SealedCredential = Pick<CredentialRow, "access_token_enc" | "refresh_token_enc" | "key_version" | "access_expires_at" | "refresh_expires_at">;

export type CredentialStore = {
  read(connectionId: string): Promise<CredentialRow | null>;
  /** Returns the row when this caller won the lease, null when someone else holds it. */
  claimLease(connectionId: string, leaseSeconds: number): Promise<CredentialRow | null>;
  /** Compare-and-swap on version; also clears the lease. */
  writeRefreshed(connectionId: string, expectedVersion: number, next: SealedCredential): Promise<boolean>;
  releaseLease(connectionId: string): Promise<void>;
  markNeedsReconnect(connectionId: string, reason: string): Promise<void>;
  markRefreshed(connectionId: string): Promise<void>;
};

export class XeroAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XeroAuthError";
  }
}

export const ACCESS_SKEW_MS = 2 * 60_000;
export const REFRESH_TOKEN_LIFETIME_MS = 60 * 86_400_000;
const LEASE_SECONDS = 30;
const POLL_MS = 250;

export type TokenDeps = {
  store: CredentialStore;
  key: TokenKey;
  refresh: (refreshToken: string) => Promise<TokenResult>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  waitTimeoutMs?: number;
};

export function sealTokens(tokens: XeroTokenSet, key: TokenKey, nowMs: number): SealedCredential {
  return {
    access_token_enc: encryptToken(tokens.accessToken, key),
    refresh_token_enc: encryptToken(tokens.refreshToken, key),
    key_version: key.version,
    access_expires_at: new Date(nowMs + tokens.expiresInSec * 1000).toISOString(),
    refresh_expires_at: new Date(nowMs + REFRESH_TOKEN_LIFETIME_MS).toISOString(),
  };
}

export async function getXeroAccessToken(
  connectionId: string,
  deps: TokenDeps,
  opts: { forceRefresh?: boolean } = {}
): Promise<string> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const row = await deps.store.read(connectionId);
  if (!row) throw new XeroAuthError("No stored Xero credentials for this connection");
  if (!opts.forceRefresh && Date.parse(row.access_expires_at) - now() > ACCESS_SKEW_MS) {
    return decryptToken(row.access_token_enc, deps.key);
  }

  const leased = await deps.store.claimLease(connectionId, LEASE_SECONDS);
  if (!leased) {
    const deadline = now() + (deps.waitTimeoutMs ?? 10_000);
    while (now() < deadline) {
      await sleep(POLL_MS);
      const fresh = await deps.store.read(connectionId);
      if (fresh && fresh.version !== row.version) return decryptToken(fresh.access_token_enc, deps.key);
    }
    throw new Error("Timed out waiting for another worker to refresh the Xero token");
  }

  // A refresh may have completed between our read and our lease.
  if (!opts.forceRefresh && leased.version !== row.version) {
    await deps.store.releaseLease(connectionId);
    return decryptToken(leased.access_token_enc, deps.key);
  }

  const result = await deps.refresh(decryptToken(leased.refresh_token_enc, deps.key));
  if (!result.ok) {
    await deps.store.releaseLease(connectionId);
    if (result.error === "invalid_grant") {
      await deps.store.markNeedsReconnect(connectionId, "Xero rejected the refresh token (invalid_grant)");
      throw new XeroAuthError("Xero rejected the refresh token");
    }
    throw new Error(`Xero token refresh failed: ${String(scrubSecrets(result.error))}`);
  }

  const written = await deps.store.writeRefreshed(connectionId, leased.version, sealTokens(result.tokens, deps.key, now()));
  // The rotated refresh token is lost if this write fails; Xero's 30-minute reuse
  // window on the old one lets the next caller recover.
  if (!written) throw new Error("Refreshed Xero token could not be saved (version conflict)");
  await deps.store.markRefreshed(connectionId);
  return result.tokens.accessToken;
}

export function supabaseCredentialStore(db: SupabaseClient): CredentialStore {
  return {
    async read(id) {
      const { data, error } = await db.from("accounting_credential").select("*").eq("connection_id", id).maybeSingle();
      assertNoError(error, "read accounting_credential");
      return (data as CredentialRow | null) ?? null;
    },
    async claimLease(id, secs) {
      const { data, error } = await db.rpc("claim_accounting_refresh_lease", { p_connection_id: id, p_lease_seconds: secs });
      assertNoError(error, "claim_accounting_refresh_lease");
      return ((data ?? []) as CredentialRow[])[0] ?? null;
    },
    async writeRefreshed(id, expected, next) {
      const { data, error } = await db
        .from("accounting_credential")
        .update({ ...next, version: expected + 1, refresh_lease_until: null, updated_at: new Date().toISOString() })
        .eq("connection_id", id)
        .eq("version", expected)
        .select("connection_id");
      assertNoError(error, "write accounting_credential");
      return (data ?? []).length === 1;
    },
    async releaseLease(id) {
      const { error } = await db.from("accounting_credential").update({ refresh_lease_until: null }).eq("connection_id", id);
      assertNoError(error, "release accounting_credential lease");
    },
    async markNeedsReconnect(id, reason) {
      const { error } = await db
        .from("accounting_connection")
        .update({ status: "needs_reconnect", last_error: String(scrubSecrets(reason)), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "connected");
      assertNoError(error, "mark accounting_connection needs_reconnect");
    },
    async markRefreshed(id) {
      const { error } = await db.from("accounting_connection").update({ last_refreshed_at: new Date().toISOString() }).eq("id", id);
      assertNoError(error, "mark accounting_connection refreshed");
    },
  };
}
