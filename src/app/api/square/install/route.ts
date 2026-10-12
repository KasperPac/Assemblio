import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { createSignedState, newNonce } from "@/lib/security/signed-state";
import { buildSquareAuthorizeUrl, getSquareConfig, isSquarePilotTenant } from "@/lib/square/config";
import { SQUARE_STATE_COOKIE, SQUARE_STATE_TTL_MS, squareSettingsUrl } from "@/lib/square/connection";

export async function GET(req: Request) {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return NextResponse.redirect(new URL("/login?redirect=/app/settings/integrations", req.url));
  if (!isAdminRole(ctx.role)) return NextResponse.redirect(squareSettingsUrl(req.url, "error", "not-admin"));
  if (!isSquarePilotTenant(ctx.tenantId)) return NextResponse.redirect(squareSettingsUrl(req.url, "error", "not-available"));
  const cfg = getSquareConfig();
  if (!cfg.ok) return NextResponse.redirect(squareSettingsUrl(req.url, "error", "not-configured"));
  const nonce = newNonce();
  const state = createSignedState({ tenantId: ctx.tenantId, userId: ctx.userId, nonce }, cfg.applicationSecret, SQUARE_STATE_TTL_MS);
  const res = NextResponse.redirect(buildSquareAuthorizeUrl(cfg, state));
  res.cookies.set(SQUARE_STATE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/square", maxAge: SQUARE_STATE_TTL_MS / 1000 });
  return res;
}
