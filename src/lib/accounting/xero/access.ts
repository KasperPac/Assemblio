// src/lib/accounting/xero/access.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, loadTokenKey } from "@/lib/security/token-crypto";
import type { XeroAccess } from "./client";
import { getXeroConfig } from "./config";
import { refreshTokens } from "./identity";
import { getXeroAccessToken, supabaseCredentialStore } from "./tokens";

/** Service-role client only. Every Xero call goes through here. */
export async function xeroAccessFor(
  db: SupabaseClient,
  connection: { id: string; external_org_id: string },
  opts: { forceRefresh?: boolean } = {}
): Promise<XeroAccess> {
  const cfg = getXeroConfig();
  if (!cfg.ok) throw new Error(`Xero is not configured: missing ${cfg.missing.join(", ")}`);
  const key = loadTokenKey();
  const accessToken = await getXeroAccessToken(
    connection.id,
    { store: supabaseCredentialStore(db), key, refresh: (rt) => refreshTokens(cfg, rt) },
    opts
  );
  return { accessToken, xeroTenantId: connection.external_org_id };
}

export async function readRefreshToken(db: SupabaseClient, connectionId: string): Promise<string | null> {
  const row = await supabaseCredentialStore(db).read(connectionId);
  return row ? decryptToken(row.refresh_token_enc, loadTokenKey()) : null;
}
