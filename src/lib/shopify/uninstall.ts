import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Handles the `app/uninstalled` webhook side effects.
 *
 * We purge the OAuth access token (the merchant has revoked it on Shopify's side already,
 * so it's no longer valid) and flip the store to `uninstalled`. We do NOT delete the
 * `shopify_store` row or any synced data here — that happens 48 hours later when
 * `shop/redact` fires (per Shopify GDPR compliance flow).
 *
 * Safe to call multiple times: subsequent uninstalls for the same store are no-ops.
 */
export async function handleAppUninstalled(
  admin: SupabaseClient,
  shopDomain: string
): Promise<{
  storeId: string | null;
  tenantId: string | null;
  tokenDeleted: boolean;
  statusChanged: boolean;
}> {
  const { data: store } = await admin
    .from("shopify_store")
    .select("id, tenant_id, status")
    .eq("store_domain", shopDomain)
    .maybeSingle();

  if (!store) {
    return { storeId: null, tenantId: null, tokenDeleted: false, statusChanged: false };
  }

  // Delete the access token. FK is ON DELETE CASCADE from shopify_store; deleting
  // the token row directly leaves the store row intact for the 48h shop/redact window.
  const { data: deletedTokens } = await admin
    .from("shopify_install_tokens")
    .delete()
    .eq("shopify_store_id", store.id)
    .eq("tenant_id", store.tenant_id)
    .select("id");
  const tokenDeleted = (deletedTokens?.length ?? 0) > 0;

  // Idempotency: only flip status if it's not already `uninstalled`.
  let statusChanged = false;
  if (store.status !== "uninstalled") {
    await admin
      .from("shopify_store")
      .update({ status: "uninstalled" })
      .eq("id", store.id)
      .eq("tenant_id", store.tenant_id);
    statusChanged = true;
  }

  await admin.from("activity_log").insert({
    tenant_id: store.tenant_id,
    event: "SHOPIFY_APP_UNINSTALLED",
    metadata: {
      shop_domain: shopDomain,
      shopify_store_id: store.id,
      token_deleted: tokenDeleted,
      status_changed: statusChanged,
    },
  });

  return {
    storeId: store.id,
    tenantId: store.tenant_id,
    tokenDeleted,
    statusChanged,
  };
}
