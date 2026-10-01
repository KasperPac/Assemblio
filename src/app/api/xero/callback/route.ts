// src/app/api/xero/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadTokenKey } from "@/lib/security/token-crypto";
import { getXeroConfig, isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { exchangeCode, listConnections, organisationsForEvent, readAuthEventId } from "@/lib/accounting/xero/identity";
import {
  finishConnection, PENDING_COOKIE, PENDING_TTL_MS, sealPending, settingsUrl,
  STATE_COOKIE, supabaseConnectionRepo, validateCallback,
} from "@/lib/accounting/connection";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import { logActivity } from "@/lib/activity/log";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cfg = getXeroConfig();
  if (!cfg.ok) return NextResponse.redirect(settingsUrl(req.url, "not-configured"));

  const ctx = await getServerTenantContext();
  if (!ctx || !ctx.tenantId) return NextResponse.redirect(new URL("/login?redirect=/app/settings/integrations", req.url));
  if (!isXeroPilotTenant(ctx.tenantId)) return NextResponse.redirect(settingsUrl(req.url, "error", "not-available"));
  const jar = await cookies();
  const check = validateCallback({
    error: url.searchParams.get("error"),
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    nonceCookie: jar.get(STATE_COOKIE)?.value ?? null,
    session: { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role },
    secret: cfg.clientSecret,
  });

  const done = (target: URL) => {
    const res = NextResponse.redirect(target);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/xero", maxAge: 0 });
    return res;
  };
  if (!check.ok) return done(settingsUrl(req.url, "error", check.reason));

  const exchanged = await exchangeCode(cfg, url.searchParams.get("code")!);
  if (!exchanged.ok) return done(settingsUrl(req.url, "error", "token-exchange"));

  let orgs;
  try {
    orgs = organisationsForEvent(await listConnections(exchanged.tokens.accessToken), readAuthEventId(exchanged.tokens.accessToken));
  } catch {
    return done(settingsUrl(req.url, "error", "connections"));
  }
  if (orgs.length === 0) return done(settingsUrl(req.url, "error", "no-organisation"));

  let key;
  try {
    key = loadTokenKey();
  } catch {
    return done(settingsUrl(req.url, "not-configured"));
  }
  const pendingOrgs = orgs.map((o) => ({ connectionId: o.id, tenantId: o.tenantId, name: o.tenantName }));

  if (pendingOrgs.length > 1) {
    const res = done(new URL("/app/settings/integrations/xero/choose", req.url));
    res.cookies.set(
      PENDING_COOKIE,
      sealPending({ tenantId: check.tenantId, userId: check.userId, tokens: exchanged.tokens, orgs: pendingOrgs, exp: Date.now() + PENDING_TTL_MS }, key),
      { httpOnly: true, secure: true, sameSite: "lax", path: "/app/settings/integrations/xero", maxAge: PENDING_TTL_MS / 1000 }
    );
    return res;
  }

  let result;
  try {
    result = await finishConnection(supabaseConnectionRepo(createSupabaseAdminClient()), {
      tenantId: check.tenantId, userId: check.userId, org: pendingOrgs[0], tokens: exchanged.tokens, key,
    });
  } catch (err) {
    console.error("[xero] save connection failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    return done(settingsUrl(req.url, "error", "save-failed"));
  }
  if (!result.ok) return done(settingsUrl(req.url, "error", result.reason));
  await logActivity({ event: "accounting.connected", entityId: result.connectionId, metadata: { org_name: result.orgName, org_changed: result.orgChanged } });
  return done(new URL("/app/settings/integrations/xero/setup", req.url));
}
