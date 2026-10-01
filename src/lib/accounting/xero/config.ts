export const XERO_SCOPES = [
  "openid", "profile", "email", "offline_access",
  "accounting.invoices", "accounting.contacts", "accounting.settings.read",
].join(" ");
export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_REVOKE_URL = "https://identity.xero.com/connect/revocation";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

type Env = Record<string, string | undefined>;
export type XeroConfigOk = { ok: true; clientId: string; clientSecret: string; redirectUri: string };
export type XeroConfig = XeroConfigOk | { ok: false; reason: "missing-config"; missing: string[] };

const REQUIRED = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI", "ACCOUNTING_TOKEN_KEY"] as const;

export function getXeroConfig(env: Env = process.env): XeroConfig {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) return { ok: false, reason: "missing-config", missing };
  return { ok: true, clientId: env.XERO_CLIENT_ID!, clientSecret: env.XERO_CLIENT_SECRET!, redirectUri: env.XERO_REDIRECT_URI! };
}

export function buildXeroAuthorizeUrl(cfg: XeroConfigOk, state: string): string {
  const p = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: XERO_SCOPES, state });
  return `${XERO_AUTHORIZE_URL}?${p.toString()}`;
}

export function isXeroPilotTenant(tenantId: string | null, env: Env = process.env): boolean {
  if (!tenantId) return false;
  const list = (env.XERO_PILOT_TENANTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes("*") || list.includes(tenantId);
}
