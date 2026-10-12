import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSquareConfig, isSquarePilotTenant, loadSquareTokenKey } from "@/lib/square/config";
import { exchangeSquareCode } from "@/lib/square/auth";
import { saveSquareConnection, SQUARE_STATE_COOKIE, squareSettingsUrl, validateSquareCallback } from "@/lib/square/connection";
import { logActivity } from "@/lib/activity/log";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const done = (target: URL) => { const res = NextResponse.redirect(target); res.cookies.set(SQUARE_STATE_COOKIE, "", { path: "/api/square", maxAge: 0 }); return res; };
  const fail = (reason: string) => done(squareSettingsUrl(req.url, "error", reason));
  const cfg = getSquareConfig();
  if (!cfg.ok) return fail("not-configured");
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return done(new URL("/login?redirect=/app/settings/integrations", req.url));
  if (!isSquarePilotTenant(ctx.tenantId)) return fail("not-available");
  const jar = await cookies();
  const check = validateSquareCallback({ error: url.searchParams.get("error"), code: url.searchParams.get("code"), state: url.searchParams.get("state"), nonceCookie: jar.get(SQUARE_STATE_COOKIE)?.value ?? null,
    session: { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }, secret: cfg.applicationSecret });
  if (!check.ok) return fail(check.reason);
  const exchanged = await exchangeSquareCode(cfg, url.searchParams.get("code")!);
  if (!exchanged.ok) return fail("token-exchange");
  let connectionId: string;
  try { connectionId = await saveSquareConnection(createSupabaseAdminClient(), { tenantId: check.tenantId, userId: check.userId, environment: cfg.environment, tokens: exchanged.data, key: loadSquareTokenKey() }); }
  catch { return fail("save-failed"); }
  // An audit outage must not present a successfully saved connection as failed.
  try { await logActivity({ event: "square.connected", entityId: connectionId, metadata: { environment: cfg.environment } }); }
  catch { console.error("[square] connection audit could not be recorded"); }
  return done(squareSettingsUrl(req.url, "connected"));
}
