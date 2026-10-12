import { SQUARE_API_VERSION, type SquareConfigOk } from "./config";
import { squareFailure, type SquareResult } from "./client";

export type SquareTokenSet = { accessToken: string; refreshToken: string; merchantId: string; expiresAt: string };
async function obtainToken(cfg: SquareConfigOk, grant: Record<string, string>, fetchImpl: typeof fetch): Promise<SquareResult<SquareTokenSet>> {
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/oauth2/token`, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "Square-Version": SQUARE_API_VERSION, Accept: "application/json" },
      body: JSON.stringify({ client_id: cfg.applicationId, client_secret: cfg.applicationSecret, ...grant, short_lived: false }), signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!res.ok) return squareFailure(res.status, body);
    if (!body || typeof body.access_token !== "string" || !body.access_token || typeof body.refresh_token !== "string" || !body.refresh_token ||
      typeof body.merchant_id !== "string" || !body.merchant_id || typeof body.expires_at !== "string" || !Number.isFinite(Date.parse(body.expires_at)) || Date.parse(body.expires_at) <= Date.now()) {
      return { ok: false, status: res.status, errorClass: "transient", code: "invalid_token_response" };
    }
    return { ok: true, data: { accessToken: body.access_token, refreshToken: body.refresh_token, merchantId: body.merchant_id, expiresAt: body.expires_at } };
  } catch { return { ok: false, status: 0, errorClass: "transient", code: "network_error" }; }
}
export function exchangeSquareCode(cfg: SquareConfigOk, code: string, fetchImpl: typeof fetch = fetch): Promise<SquareResult<SquareTokenSet>> {
  return obtainToken(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }, fetchImpl);
}
export function refreshSquareTokens(cfg: SquareConfigOk, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<SquareResult<SquareTokenSet>> {
  return obtainToken(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}
export async function revokeSquareToken(cfg: SquareConfigOk, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/oauth2/revoke`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Client ${cfg.applicationSecret}`, "Square-Version": SQUARE_API_VERSION },
      body: JSON.stringify({ client_id: cfg.applicationId, access_token: accessToken, revoke_only_access_token: false }), signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => null) as { success?: boolean } | null;
    return res.ok && body?.success === true;
  } catch { return false; }
}
