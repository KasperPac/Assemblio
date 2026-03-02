import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./settings.module.css";
import ShopifyConnect from "./shopify-connect";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";

type Props = {
  searchParams?: Promise<{
    shopify?: string;
    products?: string;
    orders?: string;
  }>;
};

type StoreRow = {
  id: string;
  store_domain: string;
  status: string;
  created_at: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_meta: Record<string, unknown> | null;
};

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) ?? {};

  const [{ data: profile }, { data: locations }, { count: userCount }] =
    await Promise.all([
    supabase
      .from("profiles")
      .select("role,tenant_id,tenant:tenant_id(name)")
      .single(),
    supabase
      .from("location")
      .select("name,is_default")
      .eq("is_default", true)
      .limit(1),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  let stores: StoreRow[] = [];
  let storesLoadError: string | null = null;

  const detailedStoresResult = await supabase
    .from("shopify_store")
    .select("id,store_domain,status,created_at,last_synced_at,last_sync_status,last_sync_meta")
    .order("created_at", { ascending: false })
    .limit(10);

  if (detailedStoresResult.error) {
    const fallbackStoresResult = await supabase
      .from("shopify_store")
      .select("id,store_domain,status,created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (fallbackStoresResult.error) {
      storesLoadError = fallbackStoresResult.error.message;
    } else {
      stores = (fallbackStoresResult.data ?? []).map((store) => ({
        ...(store as Omit<StoreRow, "last_synced_at" | "last_sync_status" | "last_sync_meta">),
        last_synced_at: null,
        last_sync_status: null,
        last_sync_meta: null,
      }));
    }
  } else {
    stores = (detailedStoresResult.data ?? []) as StoreRow[];
  }
  const tenant = Array.isArray(profile?.tenant)
    ? profile?.tenant[0] ?? null
    : profile?.tenant;

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
      ? "Healthy"
      : `${integrityIssueCount} issues detected`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Settings</h1>
          <p>Tenant configuration, defaults, and access.</p>
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Tenant</h3>
          <p>{tenant?.name ?? "Unknown"}</p>
        </div>
        <div className={styles.card}>
          <h3>Role</h3>
          <p>{profile?.role ?? "member"}</p>
        </div>
        <div className={styles.card}>
          <h3>Default Location</h3>
          <p>{locations?.[0]?.name ?? "Not configured"}</p>
        </div>
        <div className={styles.card}>
          <h3>Users</h3>
          <p>{userCount ?? 0} active</p>
        </div>
        <div className={styles.card}>
          <h3>Inventory Integrity</h3>
          <p>{integritySummary}</p>
          <span className={styles.cardMeta}>
            Invariants: {audit.invariantIssues.length} | Drift:{" "}
            {audit.reconciliationIssues.length} | Duplicate allocations:{" "}
            {audit.duplicateAllocationKeys.length} | PO over-receipts:{" "}
            {audit.poOverReceipt.length}
          </span>
          <a href="/app/reports" className={styles.cardLink}>
            View full integrity report
          </a>
        </div>
      </div>
      <ShopifyConnect status={params.shopify} />
      <div className={styles.actions}>
        <form method="post" action="/api/shopify/sync">
          <button type="submit" className={styles.syncButton}>
            Sync Latest Connected Store
          </button>
        </form>
        {params.shopify === "sync-ok" ? (
          <p className={styles.syncMeta}>
            Synced products: {params.products ?? "0"} | synced orders: {params.orders ?? "0"}
          </p>
        ) : null}
      </div>
      <div className={styles.storeList}>
        <h3>Connected Stores</h3>
        {storesLoadError ? (
          <p className={styles.empty}>Failed to load connected stores: {storesLoadError}</p>
        ) : stores.length === 0 ? (
          <p className={styles.empty}>No Shopify stores connected.</p>
        ) : (
          stores.map((store) => (
            <div className={styles.storeRowWrap} key={store.id}>
              <div className={styles.storeRow}>
                <span>{store.store_domain}</span>
                <span className={styles.status}>{store.status}</span>
              </div>
              <div className={styles.storeMeta}>
                <span>
                  Last sync: {store.last_synced_at ? new Date(store.last_synced_at).toLocaleString() : "Never"}
                </span>
                <span>
                  Sync status: {store.last_sync_status ?? "unknown"}
                </span>
                <span>
                  Last counts: {JSON.stringify(store.last_sync_meta ?? {})}
                </span>
              </div>
              <form method="post" action="/api/shopify/sync">
                <input type="hidden" name="store_id" value={store.id} />
                <button type="submit" className={styles.syncStoreButton}>Sync this store</button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
