import styles from "./vitals-panel.module.css";

export type TenantVitals = {
  // Activity
  last_activity_at: string | null;
  seven_day_event_count: number;
  seven_day_active_members: number;
  member_last_sign_in_at: string | null;
  member_count: number; // total members — passed from page, not from RPC
  // Data counts
  component_count: number;
  bom_count: number;
  open_order_count: number;
  supplier_count: number;
  // Shopify
  shopify_connected: boolean;
  shopify_store_domain: string | null;
  shopify_last_synced_at: string | null;
  shopify_last_sync_status: string | null;
  shopify_last_sync_error: string | null;
  // Accounting (most recent active connection)
  accounting_provider: string | null;
  accounting_account_name: string | null;
  accounting_token_expires_at: string | null;
  accounting_token_expired: boolean | null;
  accounting_thirty_day_synced: number;
  accounting_thirty_day_failed: number;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function tokenExpiryClass(expiresAt: string | null, expired: boolean | null): string {
  if (!expiresAt) return "";
  if (expired) return styles.statusDanger;
  const msUntil = new Date(expiresAt).getTime() - Date.now();
  const daysUntil = msUntil / (1000 * 60 * 60 * 24);
  if (daysUntil <= 7) return styles.statusWarn;
  return styles.statusOk;
}

function tokenExpiryText(expiresAt: string | null, expired: boolean | null): string {
  if (!expiresAt) return "—";
  if (expired) return "Token expired";
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return `Token expires in ${days}d`;
}

export default function VitalsPanel({ vitals }: { vitals: TenantVitals }) {
  const hasShopify = vitals.shopify_connected;
  const hasAccounting = !!vitals.accounting_provider;
  const hasAnyIntegration = hasShopify || hasAccounting;

  // Activity: warn if sign-in is null OR older than 30 days
  const signInAge = vitals.member_last_sign_in_at
    ? Date.now() - new Date(vitals.member_last_sign_in_at).getTime()
    : null;
  const signInIsStale = signInAge === null || signInAge > 30 * 24 * 60 * 60 * 1000;

  return (
    <div>
      <h2 className={styles.sectionHeading}>Vitals</h2>
      <div className={styles.grid}>
        {/* ── Card 1: Integrations ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Integrations</p>

          {!hasAnyIntegration ? (
            <p className={styles.integrationNotConnected}>No integrations connected</p>
          ) : (
            <>
              {/* Shopify */}
              <div className={styles.integrationRow}>
                <span className={styles.integrationLabel}>Shopify</span>
                {hasShopify ? (
                  <span className={styles.integrationValue}>
                    {vitals.shopify_last_sync_status === "failed" ? (
                      <span className={styles.statusDanger}>
                        Sync failed
                        {vitals.shopify_last_sync_error
                          ? ` · ${vitals.shopify_last_sync_error.slice(0, 80)}`
                          : ""}
                      </span>
                    ) : (
                      <span className={styles.statusOk}>
                        Synced {relativeTime(vitals.shopify_last_synced_at)}
                      </span>
                    )}
                    {vitals.shopify_store_domain && (
                      <>
                        <br />
                        <span className={styles.metaNote}>
                          {vitals.shopify_store_domain}
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <span className={styles.integrationNotConnected}>Not connected</span>
                )}
              </div>

              <hr className={styles.divider} />

              {/* Accounting */}
              <div className={styles.integrationRow}>
                <span className={styles.integrationLabel}>
                  {vitals.accounting_provider === "xero"
                    ? "Xero"
                    : vitals.accounting_provider === "qbo"
                    ? "QuickBooks"
                    : "Accounting"}
                </span>
                {hasAccounting ? (
                  <span className={styles.integrationValue}>
                    <span
                      className={tokenExpiryClass(
                        vitals.accounting_token_expires_at,
                        vitals.accounting_token_expired
                      )}
                    >
                      {tokenExpiryText(
                        vitals.accounting_token_expires_at,
                        vitals.accounting_token_expired
                      )}
                    </span>
                    <br />
                    <span className={styles.metaNote}>
                      {vitals.accounting_thirty_day_synced} synced /{" "}
                      {vitals.accounting_thirty_day_failed} failed (30d)
                    </span>
                  </span>
                ) : (
                  <span className={styles.integrationNotConnected}>Not connected</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Card 2: Activity ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Activity</p>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Last sign-in</span>
            <span className={signInIsStale ? styles.statValueWarn : styles.statValue}>
              {vitals.member_last_sign_in_at
                ? relativeTime(vitals.member_last_sign_in_at)
                : "No activity"}
            </span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Active members</span>
            <span className={styles.statValue}>
              {vitals.seven_day_active_members} of {vitals.member_count}
            </span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Write events</span>
            <span className={styles.statValue}>
              {vitals.seven_day_event_count.toLocaleString()}
              <span className={styles.metaNote}>{" "}(7d)</span>
            </span>
          </div>
        </div>

        {/* ── Card 3: Data snapshot ── */}
        <div className={styles.card}>
          <p className={styles.cardTitle}>Data snapshot</p>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Components (SKUs)</span>
            <span className={styles.statValue}>{vitals.component_count.toLocaleString()}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>BOMs</span>
            <span className={styles.statValue}>{vitals.bom_count.toLocaleString()}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Open orders</span>
            <span className={styles.statValue}>{vitals.open_order_count.toLocaleString()}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Suppliers</span>
            <span className={styles.statValue}>{vitals.supplier_count.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
