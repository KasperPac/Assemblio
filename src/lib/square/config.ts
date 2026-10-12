import { loadTokenKey, type TokenKey } from "@/lib/security/token-crypto";

type Env = Record<string, string | undefined>;
export const SQUARE_API_VERSION = "2026-09-16";
export const SQUARE_SCOPES = ["ITEMS_READ", "INVENTORY_READ", "INVENTORY_WRITE", "ORDERS_READ", "MERCHANT_PROFILE_READ"];
export type SquareEnvironment = "production" | "sandbox";
export type SquareConfigOk = { ok: true; applicationId: string; applicationSecret: string; redirectUri: string; environment: SquareEnvironment; baseUrl: string };
export type SquareConfig = SquareConfigOk | { ok: false; missing: string[] };
export function squareBaseUrl(environment: SquareEnvironment): string {
  return environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
}
export function loadSquareTokenKey(env: Env = process.env): TokenKey {
  try {
    if (env.SQUARE_TOKEN_KEY_VERSION !== undefined && !/^[1-9]\d*$/.test(env.SQUARE_TOKEN_KEY_VERSION)) throw new Error("Invalid key version");
    return loadTokenKey({ ACCOUNTING_TOKEN_KEY: env.SQUARE_TOKEN_KEY, ACCOUNTING_TOKEN_KEY_VERSION: env.SQUARE_TOKEN_KEY_VERSION });
  } catch { throw new Error("Square token encryption configuration is missing or invalid"); }
}
export function getSquareConfig(env: Env = process.env): SquareConfig {
  const required = ["SQUARE_APPLICATION_ID", "SQUARE_APPLICATION_SECRET", "SQUARE_REDIRECT_URI", "SQUARE_TOKEN_KEY"];
  const missing = required.filter((name) => !env[name]?.trim());
  const environment = env.SQUARE_ENVIRONMENT ?? "production";
  if (environment !== "production" && environment !== "sandbox") missing.push("SQUARE_ENVIRONMENT");
  try {
    const uri = new URL(env.SQUARE_REDIRECT_URI ?? "");
    if (uri.username || uri.password || uri.search || uri.hash || uri.pathname !== "/api/square/callback" || uri.protocol !== "https:") {
      missing.push("SQUARE_REDIRECT_URI");
    }
  } catch { missing.push("SQUARE_REDIRECT_URI"); }
  try { loadSquareTokenKey(env); } catch { missing.push("SQUARE_TOKEN_KEY"); }
  if (missing.length) return { ok: false, missing: [...new Set(missing)] };
  return { ok: true, applicationId: env.SQUARE_APPLICATION_ID!, applicationSecret: env.SQUARE_APPLICATION_SECRET!, redirectUri: env.SQUARE_REDIRECT_URI!, environment: environment as SquareEnvironment, baseUrl: squareBaseUrl(environment as SquareEnvironment) };
}
export function buildSquareAuthorizeUrl(cfg: SquareConfigOk, state: string): string {
  const params = new URLSearchParams({ client_id: cfg.applicationId, scope: SQUARE_SCOPES.join(" "), state, redirect_uri: cfg.redirectUri });
  if (cfg.environment === "production") params.set("session", "false");
  return `${cfg.baseUrl}/oauth2/authorize?${params}`;
}
export function isSquarePilotTenant(tenantId: string | null, env: Env = process.env): boolean {
  return !!tenantId && (env.SQUARE_PILOT_TENANTS ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "*").includes(tenantId);
}
