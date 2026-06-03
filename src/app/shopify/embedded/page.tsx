import {
  getShopifyOAuthConfigForApp,
  isValidShopDomain,
  normalizeShopDomain,
  type ShopifyAppId,
} from "@/lib/shopify/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import EmbeddedClient from "./embedded-client";
import styles from "./embedded.module.css";

/**
 * Resolves the App Bridge api-key for the app the merchant actually installed.
 * The embedded surface serves both the public "Manuva" app and the unlisted
 * "Manuva Fab" app at the same URL; App Bridge rejects a key that doesn't match
 * the installed app, so we read the store's app_id and emit the matching key.
 * Defaults to the public app when the shop has no store row yet.
 */
async function resolveAppBridgeApiKey(shop: string): Promise<string> {
  let appId: ShopifyAppId = "public";
  try {
    const admin = createSupabaseAdminClient();
    const { data: store } = await admin
      .from("shopify_store")
      .select("app_id")
      .eq("store_domain", shop)
      .maybeSingle();
    if (store?.app_id === "unlisted") appId = "unlisted";
  } catch {
    // Fall back to the public app key if the lookup fails.
  }
  const config = getShopifyOAuthConfigForApp(appId);
  return config.ok ? config.apiKey : "";
}

type SearchParams = Promise<{ shop?: string; host?: string }>;

export default async function EmbeddedPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const shopRaw = sp.shop ?? "";
  const host = sp.host ?? "";
  const shop = normalizeShopDomain(shopRaw);

  if (!isValidShopDomain(shop) || !host) {
    return (
      <main className={styles.frame}>
        <section className={styles.card}>
          <h1 className={styles.title}>Open from Shopify Admin</h1>
          <p className={styles.body}>
            This page is only accessible when launched from inside the Shopify Admin.
            Open your store, click <strong>Apps &rarr; Manuva</strong> and we&apos;ll load here.
          </p>
          <a className={styles.linkOut} href="https://manuva.app">
            Learn more about Manuva &rarr;
          </a>
        </section>
      </main>
    );
  }

  const apiKey = await resolveAppBridgeApiKey(shop);

  return (
    <>
      {/*
        App Bridge MUST be loaded as the first <script> tag with no async/defer/module.
        React 19 hoists raw <script> tags to <head> and renders them synchronously
        (no async attribute), which satisfies App Bridge's loader check. The
        shopify-api-key meta must precede the loader and match the installed app.
        https://shopify.dev/docs/api/app-bridge-library
      */}
      <meta name="shopify-api-key" content={apiKey} />
      {/* App Bridge requires a synchronous (non-async/defer) loader script. */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      <EmbeddedClient shop={shop} />
    </>
  );
}
