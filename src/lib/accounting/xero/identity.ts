import { XERO_CONNECTIONS_URL, XERO_REVOKE_URL, XERO_TOKEN_URL, type XeroConfigOk } from "./config";

type FetchLike = typeof fetch;
export type XeroTokenSet = { accessToken: string; refreshToken: string; expiresInSec: number };
export type TokenResult = { ok: true; tokens: XeroTokenSet } | { ok: false; status: number; error: string };
export type XeroConnectionInfo = { id: string; tenantId: string; tenantName: string; tenantType: string; authEventId: string };

const TIMEOUT_MS = 15_000;

function basicAuth(cfg: XeroConfigOk): string {
  return "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

function postForm(url: string, cfg: XeroConfigOk, form: Record<string, string>, fetchImpl: FetchLike) {
  return fetchImpl(url, {
    method: "POST",
    headers: { Authorization: basicAuth(cfg), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function toTokenResult(res: Response): Promise<TokenResult> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : `http_${res.status}` };
  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    return { ok: false, status: res.status, error: "missing_tokens" };
  }
  return {
    ok: true,
    tokens: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresInSec: typeof body.expires_in === "number" ? body.expires_in : 1800,
    },
  };
}

export async function exchangeCode(cfg: XeroConfigOk, code: string, fetchImpl: FetchLike = fetch): Promise<TokenResult> {
  try {
    return await toTokenResult(await postForm(XERO_TOKEN_URL, cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }, fetchImpl));
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export async function refreshTokens(cfg: XeroConfigOk, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<TokenResult> {
  try {
    return await toTokenResult(await postForm(XERO_TOKEN_URL, cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl));
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export async function revokeRefreshToken(cfg: XeroConfigOk, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    return (await postForm(XERO_REVOKE_URL, cfg, { token: refreshToken }, fetchImpl)).ok;
  } catch {
    return false;
  }
}

export async function listConnections(accessToken: string, fetchImpl: FetchLike = fetch): Promise<XeroConnectionInfo[]> {
  const res = await fetchImpl(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Xero /connections returned ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    tenantId: String(r.tenantId),
    tenantName: String(r.tenantName ?? ""),
    tenantType: String(r.tenantType ?? ""),
    authEventId: String(r.authEventId ?? ""),
  }));
}

export async function deleteConnection(accessToken: string, connectionId: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${XERO_CONNECTIONS_URL}/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** The token came straight from Xero over TLS; we only read a claim, we do not trust it for auth. */
export function readAuthEventId(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof claims.authentication_event_id === "string" ? claims.authentication_event_id : null;
  } catch {
    return null;
  }
}

export function organisationsForEvent(conns: XeroConnectionInfo[], authEventId: string | null): XeroConnectionInfo[] {
  if (!authEventId) return [];
  return conns.filter((c) => c.authEventId === authEventId && c.tenantType === "ORGANISATION");
}
