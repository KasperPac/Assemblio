import type { SupabaseClient } from "@supabase/supabase-js";
import { readSignedState } from "@/lib/security/signed-state";
import { isAdminRole } from "@/lib/tenant/authz";
import type { TokenKey } from "@/lib/security/token-crypto";
import type { SquareEnvironment } from "./config";
import type { SquareTokenSet } from "./auth";
import { sealSquareTokens } from "./tokens";

export const SQUARE_STATE_COOKIE = "square_oauth_nonce";
export const SQUARE_STATE_TTL_MS = 5 * 60_000;
export type SquareConnectionRow = { id: string; tenant_id: string; sales_channel_id: string; merchant_id: string; environment: SquareEnvironment; status: "active" | "needs_reconnect" | "disconnected"; connected_by: string | null; connected_at: string; updated_at: string };
export function squareSettingsUrl(base: string, status: string, reason?: string): URL {
  const url = new URL("/app/settings/integrations", base);
  url.searchParams.set("square", status);
  if (reason) url.searchParams.set("reason", reason);
  return url;
}
export function validateSquareCallback(input: { error: string | null; code: string | null; state: string | null; nonceCookie: string | null; session: { tenantId: string | null; userId: string; role: string } | null; secret: string; now?: number }): { ok: true; tenantId: string; userId: string } | { ok: false; reason: string } {
  if (!input.session?.tenantId) return { ok: false, reason: "no-session" };
  if (!isAdminRole(input.session.role)) return { ok: false, reason: "not-admin" };
  if (!input.state || !input.nonceCookie) return { ok: false, reason: "bad-state" };
  try {
    const read = readSignedState<{ tenantId: string; userId: string; nonce: string }>(input.state, input.secret, input.now);
    if (!read.ok) return { ok: false, reason: read.reason === "expired" ? "expired" : "bad-state" };
    if (read.payload.nonce !== input.nonceCookie) return { ok: false, reason: "nonce-mismatch" };
    if (read.payload.tenantId !== input.session.tenantId || read.payload.userId !== input.session.userId) return { ok: false, reason: "session-mismatch" };
  } catch { return { ok: false, reason: "bad-state" }; }
  if (input.error) return { ok: false, reason: input.error === "access_denied" ? "square-denied" : "square-error" };
  if (!input.code) return { ok: false, reason: "bad-state" };
  return { ok: true, tenantId: input.session.tenantId, userId: input.session.userId };
}
export async function saveSquareConnection(db: SupabaseClient, args: { tenantId: string; userId: string; environment: SquareEnvironment; tokens: SquareTokenSet; key: TokenKey }): Promise<string> {
  const sealed = sealSquareTokens(args.tokens, args.key);
  const { data, error } = await db.rpc("save_square_connection", { p_tenant_id: args.tenantId, p_user_id: args.userId, p_merchant_id: args.tokens.merchantId, p_environment: args.environment,
    p_access_token_enc: sealed.access_token_enc, p_refresh_token_enc: sealed.refresh_token_enc, p_key_version: sealed.key_version, p_access_expires_at: sealed.access_expires_at });
  if (error || typeof data !== "string") throw new Error("Square connection could not be saved");
  return data;
}
