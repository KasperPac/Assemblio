"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerTenantContext } from "@/lib/tenant/context";
import { syncShopifyStoreData } from "@/lib/shopify/sync";

export async function resyncOrderPrices() {
  const context = await getServerTenantContext();
  if (!context) redirect("/app/profitability?error=unauthenticated");

  const { tenantId } = context;
  const admin = createSupabaseAdminClient();

  const { data: store } = await admin
    .from("shopify_store")
    .select("id,store_domain")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!store) redirect("/app/profitability?error=no_store");

  const { data: tokenRow } = await admin
    .from("shopify_install_tokens")
    .select("access_token")
    .eq("tenant_id", tenantId)
    .eq("shopify_store_id", store.id)
    .maybeSingle();

  if (!tokenRow?.access_token) redirect("/app/profitability?error=no_token");

  await syncShopifyStoreData(tenantId, store.store_domain, tokenRow.access_token);

  redirect("/app/profitability?synced=1");
}
