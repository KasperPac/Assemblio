// src/app/api/xero/install/route.ts
import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { buildXeroAuthorizeUrl, getXeroConfig, isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { createSignedState, newNonce } from "@/lib/security/signed-state";
import { settingsUrl, STATE_COOKIE, STATE_TTL_MS } from "@/lib/accounting/connection";

export async function GET(req: Request) {
  const ctx = await getServerTenantContext();
  if (!ctx || !ctx.tenantId) return NextResponse.redirect(new URL("/login?redirect=/app/settings/integrations", req.url));
  if (!isAdminRole(ctx.role)) return NextResponse.redirect(settingsUrl(req.url, "error", "not-admin"));
  if (!isXeroPilotTenant(ctx.tenantId)) return NextResponse.redirect(settingsUrl(req.url, "error", "not-available"));
  const cfg = getXeroConfig();
  if (!cfg.ok) return NextResponse.redirect(settingsUrl(req.url, "not-configured"));

  const nonce = newNonce();
  const state = createSignedState({ tenantId: ctx.tenantId, userId: ctx.userId, nonce }, cfg.clientSecret, STATE_TTL_MS);
  const res = NextResponse.redirect(buildXeroAuthorizeUrl(cfg, state));
  res.cookies.set(STATE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/xero", maxAge: STATE_TTL_MS / 1000 });
  return res;
}
