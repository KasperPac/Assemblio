"use client";

import { useState } from "react";
import styles from "./settings.module.css";

type Props = {
  status?: string;
  detail?: string;
};

const statusText: Record<string, string> = {
  connected: "Shopify store connected successfully.",
  "connected-webhooks-failed":
    "Store connected, but webhook registration failed. Check app URL and try reconnect.",
  "invalid-shop": "Invalid shop domain. Use your-store.myshopify.com.",
  "invalid-hmac": "Shopify callback failed HMAC validation.",
  "invalid-callback": "Missing callback fields from Shopify.",
  "state-missing": "OAuth state cookie missing. Start install again.",
  "state-invalid": "OAuth state could not be decoded.",
  "state-expired": "OAuth state expired. Start install again.",
  "state-nonce-mismatch":
    "OAuth state nonce mismatch. Start install from Assemblio Settings and complete in the same tab.",
  "state-shop-mismatch":
    "OAuth shop mismatch. Use the same shop domain in Settings that Shopify redirects back with.",
  "token-failed": "Could not exchange auth code for access token.",
  "store-save-failed": "Could not save Shopify store in database.",
  "token-save-failed": "Could not save Shopify access token.",
  "missing-tenant": "No tenant found for current user.",
  "no-store": "No active Shopify store is connected for this tenant.",
  "no-token": "No Shopify access token found. Reconnect the store.",
  disconnected: "Shopify store disconnected. You can reconnect now.",
  "disconnect-failed": "Could not disconnect Shopify store. Try again.",
  "sync-ok": "Shopify sync completed successfully.",
  "sync-failed": "Shopify sync failed. Check scopes and token validity.",
  "config-missing":
    "Shopify config missing. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and NEXT_PUBLIC_APP_URL in .env.local.",
};

export default function ShopifyConnect({ status, detail }: Props) {
  const [shop, setShop] = useState("");

  return (
    <div className={styles.shopifyCard}>
      <div>
        <h3>Shopify Connection</h3>
        <p>Connect a store to enable product and order sync.</p>
      </div>
      {status ? (
        <p className={styles.notice}>
          {statusText[status] ?? status}
          {(status === "sync-failed" || status === "disconnect-failed") && detail
            ? ` (${detail})`
            : ""}
        </p>
      ) : null}
      <form className={styles.shopifyForm} action="/api/shopify/auth" method="get">
        <input
          name="shop"
          placeholder="your-store.myshopify.com"
          value={shop}
          onChange={(event) => setShop(event.target.value)}
          required
        />
        <button type="submit">Connect Shopify</button>
      </form>
    </div>
  );
}
