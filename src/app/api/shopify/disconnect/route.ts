import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?redirect=/app/settings", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .single();
  if (!profile?.tenant_id) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=missing-tenant", request.url)
    );
  }

  const form = await request.formData();
  const storeId = form.get("store_id")?.toString();
  if (!storeId) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=disconnect-failed", request.url)
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: storeRows } = await admin
    .from("shopify_store")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("id", storeId)
    .limit(1);
  const store = storeRows?.[0];

  if (!store) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=no-store", request.url)
    );
  }

  const { error: tokenDeleteError } = await admin
    .from("shopify_install_tokens")
    .delete()
    .eq("tenant_id", profile.tenant_id)
    .eq("shopify_store_id", store.id);
  if (tokenDeleteError) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=disconnect-failed", request.url)
    );
  }

  const { error: storeUpdateError } = await admin
    .from("shopify_store")
    .update({
      status: "disconnected",
      last_sync_status: "disconnected",
      last_sync_meta: { reason: "manual_disconnect" },
    })
    .eq("tenant_id", profile.tenant_id)
    .eq("id", store.id);
  if (storeUpdateError) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=disconnect-failed", request.url)
    );
  }

  return NextResponse.redirect(
    new URL("/app/settings?shopify=disconnected", request.url)
  );
}
