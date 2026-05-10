"use client";

import { useRouter } from "next/navigation";
import styles from "./integrations.module.css";

type BannerVariant = "success" | "warning" | "error";

const SUCCESS_STATUSES = new Set(["connected", "disconnected", "sync-ok"]);
const WARNING_STATUSES = new Set(["connected-webhooks-failed"]);

function getVariant(status: string): BannerVariant {
  if (SUCCESS_STATUSES.has(status)) return "success";
  if (WARNING_STATUSES.has(status)) return "warning";
  return "error";
}

const STATUS_TEXT: Record<string, string> = {
  connected: "Shopify store connected successfully.",
  "connected-webhooks-failed":
    "Store connected, but webhook registration failed. Check app URL and try reconnecting.",
  "install-expired": "Install session expired. Start again from the Shopify App Store.",
  disconnected: "Shopify store disconnected.",
  "disconnect-failed": "Could not disconnect Shopify store. Try again.",
  "sync-ok": "Shopify sync completed.",
  "sync-failed": "Shopify sync failed. Check scopes and token validity.",
  "config-missing":
    "Shopify config missing. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and NEXT_PUBLIC_APP_URL.",
  "invalid-shop": "Invalid shop domain. Use your-store.myshopify.com.",
  "invalid-hmac": "Shopify callback failed HMAC validation.",
  "invalid-callback": "Missing callback fields from Shopify.",
  "state-missing": "OAuth state cookie missing. Start install again.",
  "state-invalid": "OAuth state could not be decoded.",
  "state-expired": "OAuth state expired. Start install again.",
  "state-nonce-mismatch":
    "OAuth state nonce mismatch. Complete install in the same tab you started it in.",
  "state-shop-mismatch":
    "OAuth shop mismatch. Use the same shop domain you entered in Settings.",
  "token-failed": "Could not exchange auth code for access token.",
  "store-save-failed": "Could not save Shopify store.",
  "token-save-failed": "Could not save Shopify access token.",
  "missing-tenant": "No workspace found for current user.",
  "no-store": "No active Shopify store connected for this workspace.",
  "no-token": "No Shopify access token found. Reconnect the store.",
  "tenant-mismatch": "Workspace mismatch during OAuth. Sign in and try again.",
  "tenant-store-conflict":
    "This Shopify store is already linked to a different Manuva account.",
};

type Props = {
  status: string;
  detail?: string;
  products?: string;
  orders?: string;
};

export default function StatusBanner({ status, detail, products, orders }: Props) {
  const router = useRouter();
  const variant = getVariant(status);

  let text = STATUS_TEXT[status] ?? status;
  if (status === "sync-ok" && (products || orders)) {
    const parts: string[] = [];
    if (products) parts.push(`${products} products`);
    if (orders) parts.push(`${orders} orders`);
    text = `Shopify sync completed — ${parts.join(", ")} synced.`;
  }
  if (detail && variant !== "success") {
    text = `${text} (${detail})`;
  }

  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete("shopify");
    url.searchParams.delete("sync_error");
    url.searchParams.delete("products");
    url.searchParams.delete("orders");
    router.replace(url.pathname + (url.search || ""));
  }

  const variantClass =
    variant === "success"
      ? styles["banner--success"]
      : variant === "warning"
      ? styles["banner--warning"]
      : styles["banner--error"];

  return (
    <div className={`${styles.banner} ${variantClass}`} role={variant === "success" ? "status" : "alert"}>
      <span className={styles.bannerText}>{text}</span>
      <button
        type="button"
        className={styles.bannerDismiss}
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
