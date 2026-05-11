import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { buildXeroAuthUrl } from "@/lib/accounting/xero";

const SETTINGS_URL = `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations`;

export async function GET() {
  const ctx = await getServerTenantContext();
  if (!ctx || (ctx.role !== "admin" && ctx.role !== "super_admin")) {
    return NextResponse.redirect(SETTINGS_URL);
  }

  const state = `${crypto.randomUUID()}:${ctx.tenantId}`;
  const authUrl = buildXeroAuthUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
