import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./settings.module.css";
import ShopifyConnect from "./shopify-connect";
import SyncSubmitForm from "./sync-submit-form";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";
import SyncMetaChips from "./sync-meta-chips";

type Props = {
  searchParams?: Promise<{
    shopify?: string;
    products?: string;
    orders?: string;
    sync_error?: string;
  }>;
};

type StoreRow = {
  id: string;
  store_domain: string;
  status: string;
  created_at?: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_meta: Record<string, unknown> | null;
};

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) ?? {};

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: locations }, { count: userCount }, { data: accessRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("role,tenant_id,tenant:tenant_id(name)")
        .eq("id", user?.id ?? "")
        .maybeSingle(),
      supabase
        .from("location")
        .select("name,is_default")
        .eq("is_default", true)
        .limit(1),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase
        .from("profile_tenant_access")
        .select("tenant_id,tenant:tenant_id(name)")
        .eq("profile_id", user?.id ?? ""),
    ]);

  let stores: StoreRow[] = [];
  let storesLoadError: string | null = null;

  const detailedStoresResult = await supabase
    .from("shopify_store")
    .select(
      "id,store_domain,status,created_at,last_synced_at,last_sync_status,last_sync_meta"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (detailedStoresResult.error) {
    const fallbackStoresResult = await supabase
      .from("shopify_store")
      .select("id,store_domain,status,created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!fallbackStoresResult.error) {
      stores = (fallbackStoresResult.data ?? []).map((store) => ({
        ...(store as Omit<
          StoreRow,
          "last_synced_at" | "last_sync_status" | "last_sync_meta"
        >),
        last_synced_at: null,
        last_sync_status: null,
        last_sync_meta: null,
      }));
    } else {
      const fallbackMinimalStoresResult = await supabase
        .from("shopify_store")
        .select("id,store_domain,status")
        .limit(10);

      if (fallbackMinimalStoresResult.error) {
        storesLoadError = fallbackMinimalStoresResult.error.message;
      } else {
        stores = (fallbackMinimalStoresResult.data ?? []).map((store) => ({
          ...(store as Omit<
            StoreRow,
            "created_at" | "last_synced_at" | "last_sync_status" | "last_sync_meta"
          >),
          created_at: null,
          last_synced_at: null,
          last_sync_status: null,
          last_sync_meta: null,
        }));
      }
    }
  } else {
    stores = (detailedStoresResult.data ?? []) as StoreRow[];
  }

  if (stores.length > 1) {
    stores = [...stores].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }
  if (stores.length > 10) {
    stores = stores.slice(0, 10);
  }
  const profileTenant = Array.isArray(profile?.tenant)
    ? profile?.tenant[0] ?? null
    : profile?.tenant;
  const accessTenant = (accessRows ?? [])
    .map((row) => (Array.isArray(row.tenant) ? row.tenant[0] : row.tenant))
    .find((t) => t?.tenant_id === profile?.tenant_id || (t as { id?: string })?.id === profile?.tenant_id);
  const tenant = profileTenant?.name
    ? profileTenant
    : accessTenant ?? profileTenant;

  const audit = profile?.tenant_id
    ? await loadInventoryIntegrityAudit(
        supabase as unknown as AuditClient,
        profile.tenant_id
      )
    : {
        invariantIssues: [],
        reconciliationIssues: [],
        duplicateAllocationKeys: [],
        poOverReceipt: [],
      };

  const integrityIssueCount =
    audit.invariantIssues.length +
    audit.reconciliationIssues.length +
    audit.duplicateAllocationKeys.length +
    audit.poOverReceipt.length;
  const integritySummary =
    integrityIssueCount === 0
      ? "Inventory controls are healthy"
      : `${integrityIssueCount} issue${integrityIssueCount === 1 ? "" : "s"} need review`;
  const integrityVariant = integrityIssueCount === 0 ? "success" : "warning";

  const overviewCards = [
    {
      title: "Tenant",
      value: tenant?.name ?? "No tenant access",
      detail: tenant?.name
        ? "Current workspace context"
        : "Profile is missing a profile_tenant_access row for the active tenant.",
    },
    {
      title: "Role",
      value: profile?.role ?? "member",
      detail: `${userCount ?? 0} active user${userCount === 1 ? "" : "s"}`,
    },
    {
      title: "Default location",
      value: locations?.[0]?.name ?? "Not configured",
      detail: "Used as the default operational location",
    },
    {
      title: "Integrity",
      value: integrityIssueCount === 0 ? "Healthy" : `${integrityIssueCount}`,
      detail: integritySummary,
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Settings"
        title="Workspace controls"
        description="Tenant context, Shopify connectivity, and inventory integrity checks for the current Assemblio workspace."
        actions={
          <Link href="/app/settings/theme" className={styles.themeLink}>
            Theme settings
          </Link>
        }
      />

      <div className={styles.overviewGrid}>
        {overviewCards.map((card) => (
          <div key={card.title} className={styles.overviewCard}>
            <span>{card.title}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </div>
        ))}
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.primaryColumn}>
          <ShopifyConnect status={params.shopify} detail={params.sync_error} />

          <section className={styles.integrityPanel}>
            <div className={styles.integrityHeader}>
              <div>
                <p className={styles.eyebrow}>Integrity posture</p>
                <h2>Inventory controls</h2>
              </div>
              <StatusBadge variant={integrityVariant}>{integritySummary}</StatusBadge>
            </div>
            <div className={styles.integrityGrid}>
              <div className={styles.integrityCard}>
                <span>Invariant issues</span>
                <strong>{audit.invariantIssues.length}</strong>
              </div>
              <div className={styles.integrityCard}>
                <span>Reconciliation drift</span>
                <strong>{audit.reconciliationIssues.length}</strong>
              </div>
              <div className={styles.integrityCard}>
                <span>Duplicate allocations</span>
                <strong>{audit.duplicateAllocationKeys.length}</strong>
              </div>
              <div className={styles.integrityCard}>
                <span>PO over-receipts</span>
                <strong>{audit.poOverReceipt.length}</strong>
              </div>
            </div>
            <Link href="/app/reports" className={styles.reportLink}>
              Open full integrity reporting
            </Link>
          </section>
        </div>

        <aside className={styles.secondaryColumn}>
          <section className={styles.syncPanel}>
            <div>
              <p className={styles.eyebrow}>Manual sync</p>
              <h2>Latest connected store</h2>
              <p className={styles.panelBody}>
                Run a full product and order sync against the most recently connected store.
              </p>
            </div>
            <SyncSubmitForm
              buttonClassName={styles.syncButton}
              buttonLabel="Sync latest connected store"
            />
            {params.shopify === "sync-ok" ? (
              <p className={styles.syncMeta}>
                Synced products: {params.products ?? "0"} • Synced orders: {params.orders ?? "0"}
              </p>
            ) : null}
          </section>

          <section className={styles.themeCard}>
            <p className={styles.eyebrow}>Theme</p>
            <h2>Visual customization</h2>
            <p className={styles.panelBody}>
              Adjust the app palette and shell look without affecting data or workflows.
            </p>
            <Link href="/app/settings/theme" className={styles.themeLinkSecondary}>
              Change theme
            </Link>
          </section>
        </aside>
      </div>

      <ListPanel
        eyebrow="Connections"
        title="Connected Shopify stores"
        description="Review sync history, run a targeted sync, or disconnect an installed Shopify store."
        columns={["Store", "Status", "Last sync", "Sync state", "Actions"]}
        columnsTemplate="1.2fr 0.7fr 1fr 1fr 1.2fr"
      >
        {storesLoadError ? (
          <EmptyState
            title="Failed to load connected stores"
            message={storesLoadError}
          />
        ) : stores.length === 0 ? (
          <EmptyState
            title="No Shopify stores connected"
            message="Connect a Shopify store above to enable catalog and order sync."
          />
        ) : (
          stores.map((store) => (
            <ListRow
              key={store.id}
              columnsTemplate="1.2fr 0.7fr 1fr 1fr 1.2fr"
              className={styles.storeRow}
            >
              <div className={styles.storeCell}>
                <strong>{store.store_domain}</strong>
                <span className={styles.meta}>
                  {store.created_at
                    ? `Connected ${new Date(store.created_at).toLocaleDateString("en-GB")}`
                    : "Connected store"}
                </span>
              </div>
              <StatusBadge variant={store.status === "active" ? "success" : "warning"}>
                {store.status}
              </StatusBadge>
              <span className={styles.meta}>
                {store.last_synced_at
                  ? new Date(store.last_synced_at).toLocaleString("en-AU")
                  : "Never"}
              </span>
              <div className={styles.storeCell}>
                <strong>{store.last_sync_status ?? "unknown"}</strong>
                <SyncMetaChips meta={store.last_sync_meta} />
              </div>
              <div className={styles.storeActions}>
                <SyncSubmitForm
                  storeId={store.id}
                  buttonClassName={styles.syncStoreButton}
                  buttonLabel="Sync this store"
                />
                <form method="post" action="/api/shopify/disconnect">
                  <input type="hidden" name="store_id" value={store.id} />
                  <button type="submit" className={styles.disconnectStoreButton}>
                    Disconnect
                  </button>
                </form>
              </div>
            </ListRow>
          ))
        )}
      </ListPanel>
    </div>
  );
}
