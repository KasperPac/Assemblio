"use client";

import { useRouter } from "next/navigation";
import styles from "./integrations.module.css";

type SyncEvent = {
  id: string;
  status: "synced" | "failed";
  error: string | null;
  synced_at: string;
  external_id: string | null;
};

type Props = {
  connected: boolean;
  accountName?: string;
  recentSyncs: SyncEvent[];
  xeroParam?: string;
};

const XERO_MESSAGES: Record<string, { text: string; variant: "success" | "error" }> = {
  connected: { text: "Xero connected successfully.", variant: "success" },
  disconnected: { text: "Xero disconnected.", variant: "success" },
  error: { text: "Xero connection failed. Please try again.", variant: "error" },
};

export default function XeroManage({ connected, accountName, recentSyncs, xeroParam }: Props) {
  const router = useRouter();

  function dismissBanner() {
    const url = new URL(window.location.href);
    url.searchParams.delete("xero");
    router.replace(url.pathname + (url.search || ""));
  }

  const banner = xeroParam ? XERO_MESSAGES[xeroParam] : null;

  return (
    <div className={styles.integrationSection}>
      {banner && (
        <div
          className={`${styles.banner} ${
            banner.variant === "success" ? styles["banner--success"] : styles["banner--error"]
          }`}
          role={banner.variant === "success" ? "status" : "alert"}
          aria-live={banner.variant === "success" ? "polite" : "assertive"}
        >
          <span className={styles.bannerText}>{banner.text}</span>
          <button
            type="button"
            className={styles.bannerDismiss}
            onClick={dismissBanner}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.integrationRow}>
        <div className={styles.integrationInfo}>
          <span className={styles.integrationName}>Xero</span>
          {connected ? (
            <span className={styles.integrationConnected}>{accountName}</span>
          ) : (
            <span className={styles.integrationDesc}>
              Automatically push bills to Xero when deliveries are received.
            </span>
          )}
        </div>
        {connected ? (
          <form action="/api/xero/disconnect" method="POST">
            <button type="submit" className={styles.disconnectButton}>
              Disconnect
            </button>
          </form>
        ) : (
          <a href="/api/xero/install" className={styles.connectButton}>
            Connect Xero
          </a>
        )}
      </div>

      {connected && recentSyncs.length > 0 && (
        <table className={styles.syncTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Xero Bill ID</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {recentSyncs.map((ev) => (
              <tr key={ev.id}>
                <td>{new Date(ev.synced_at).toLocaleDateString()}</td>
                <td>{ev.status}</td>
                <td>{ev.external_id ?? "—"}</td>
                <td title={ev.error ?? ""}>{ev.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
