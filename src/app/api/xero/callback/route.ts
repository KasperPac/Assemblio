import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { exchangeXeroCode, getXeroOrgs } from "@/lib/accounting/xero";

const SETTINGS_URL = `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations`;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = request.cookies.get("xero_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    const res = NextResponse.redirect(`${SETTINGS_URL}?xero=error`);
    res.cookies.delete("xero_oauth_state");
    return res;
  }

  // State is "{nonce}:{tenantId}"
  const tenantId = storedState.split(":").slice(1).join(":");

  try {
    const tokens = await exchangeXeroCode(code);
    const orgs = await getXeroOrgs(tokens.access_token);
    if (orgs.length === 0) throw new Error("No Xero organisations found");

    const org = orgs[0];
    const admin = createSupabaseAdminClient();

    await admin
      .from("accounting_connection")
      .update({ is_active: false })
      .eq("tenant_id", tenantId)
      .eq("provider", "xero")
      .eq("is_active", true);

    await admin.from("accounting_connection").insert({
      tenant_id: tenantId,
      provider: "xero",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      provider_org_id: org.tenantId,
      account_name: org.tenantName,
      is_active: true,
    });

    const res = NextResponse.redirect(`${SETTINGS_URL}?xero=connected`);
    res.cookies.delete("xero_oauth_state");
    return res;
  } catch (err) {
    console.error("[xero/callback]", err);
    const res = NextResponse.redirect(`${SETTINGS_URL}?xero=error`);
    res.cookies.delete("xero_oauth_state");
    return res;
  }
}
