import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SETTINGS_URL = `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations`;

export async function POST() {
  const ctx = await getServerTenantContext();
  if (!ctx || (ctx.role !== "admin" && ctx.role !== "super_admin")) {
    return NextResponse.redirect(`${SETTINGS_URL}?xero=error`);
  }

  const admin = createSupabaseAdminClient();
  await admin
    .from("accounting_connection")
    .update({ is_active: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("provider", "xero")
    .eq("is_active", true);

  return NextResponse.redirect(`${SETTINGS_URL}?xero=disconnected`);
}
