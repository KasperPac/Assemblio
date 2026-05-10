import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncShopifyStoreData } from "@/lib/shopify/sync";
import { getMissingSyncScopes } from "@/lib/shopify/scopes";

export async function POST(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("return_to") ?? "";
  const returnTo = raw.startsWith("/app/") ? raw : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?redirect=/app/settings/integrations", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) {
    const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);
    dest.searchParams.set("shopify", "sync-failed");
    dest.searchParams.set("sync_error", "Could not resolve tenant. Try refreshing and signing in again.");
    return NextResponse.redirect(dest);
  }

  const form = await request.formData();
  const requestedStoreId = form.get("store_id")?.toString();

  const admin = createSupabaseAdminClient();
  let storeQuery = admin
    .from("shopify_store")
    .select("id,store_domain")
    .eq("tenant_id", profile.tenant_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (requestedStoreId) {
    storeQuery = admin
      .from("shopify_store")
      .select("id,store_domain")
      .eq("tenant_id", profile.tenant_id)
      .eq("id", requestedStoreId)
      .eq("status", "active")
      .limit(1);
  }

  const { data: storeRows } = await storeQuery;
  const store = storeRows?.[0];

  if (!store) {
    const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);
    dest.searchParams.set("shopify", "sync-failed");
    dest.searchParams.set("sync_error", "No active Shopify store found. Connect one in Settings.");
    return NextResponse.redirect(dest);
  }

  const { data: tokenRow } = await admin
    .from("shopify_install_tokens")
    .select("access_token,scopes")
    .eq("tenant_id", profile.tenant_id)
    .eq("shopify_store_id", store.id)
    .single();

  if (!tokenRow?.access_token) {
    const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);
    dest.searchParams.set("shopify", "sync-failed");
    dest.searchParams.set("sync_error", "No access token found. Reconnect the Shopify store in Settings.");
    return NextResponse.redirect(dest);
  }

  const missingScopes = getMissingSyncScopes(tokenRow.scopes);
  if (missingScopes.length > 0) {
    const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);
    dest.searchParams.set("shopify", "sync-failed");
    dest.searchParams.set("sync_error", `Missing Shopify scopes: ${missingScopes.join(", ")}. Reconnect the store in Settings.`);
    return NextResponse.redirect(dest);
  }

  try {
    const result = await syncShopifyStoreData(
      profile.tenant_id,
      store.store_domain,
      tokenRow.access_token
    );

    await admin
      .from("shopify_store")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_meta: {
          products: result.products,
          variants: result.variants,
          orders: result.orders,
          orderLines: result.orderLines,
          allocations: result.allocations,
          plan_runs: result.planRuns,
          plan_errors: result.planErrors,
        },
      })
      .eq("tenant_id", profile.tenant_id)
      .eq("id", store.id);

    const successPath = returnTo
      ? `${returnTo}?shopify=sync-ok&products=${result.products}&orders=${result.orders}`
      : `/app/settings/integrations?shopify=sync-ok&products=${result.products}&orders=${result.orders}`;
    return NextResponse.redirect(new URL(successPath, request.url));
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "Unknown sync error";
    await admin
      .from("shopify_store")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "failed",
        last_sync_meta: { error: message },
      })
      .eq("tenant_id", profile.tenant_id)
      .eq("id", store.id);

    const failedBase = returnTo ?? "/app/settings/integrations";
    const failedUrl = new URL(failedBase, request.url);
    failedUrl.searchParams.set("shopify", "sync-failed");
    failedUrl.searchParams.set("sync_error", message.slice(0, 180));
    return NextResponse.redirect(failedUrl);
  }
}
