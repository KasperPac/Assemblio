import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./trash.module.css";
import {
  emptyTrash,
  restoreBom,
  restorePurchaseOrder,
  restoreStocktakeSession,
} from "./actions";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";

type StoreRow = {
  id: string;
  store_domain: string;
  status: string;
  last_synced_at: string | null;
};

type ActivityRow = {
  id: string;
  event: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type ArchivedPoRow = {
  id: string;
  status: string;
  created_at: string;
  supplier: { name: string | null } | Array<{ name: string | null }> | null;
};

type ArchivedStocktakeRow = {
  id: string;
  status: string;
  created_at: string;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

type ArchivedBomRow = {
  id: string;
  version: number;
  status: string;
  created_at: string;
  variant:
    | { title: string | null; sku: string | null }
    | Array<{ title: string | null; sku: string | null }>
    | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export default async function TrashPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const [
    { data: stores },
    { data: activity },
    { data: archivedPos },
    { data: archivedStocktakes },
    { data: archivedBoms },
  ] = await Promise.all([
    supabase
      .from("shopify_store")
      .select("id,store_domain,status,last_synced_at")
      .eq("tenant_id", tenantId)
      .eq("status", "uninstalled")
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("id,event,created_at,metadata")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("purchase_order")
      .select("id,status,created_at,supplier:supplier_id(name)")
      .eq("tenant_id", tenantId)
      .eq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("stocktake_session")
      .select("id,status,created_at,location:location_id(name)")
      .eq("tenant_id", tenantId)
      .eq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("product_bom")
      .select("id,version,status,created_at,variant:variant_id(title,sku)")
      .eq("tenant_id", tenantId)
      .eq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const deleteLike = ((activity ?? []) as ActivityRow[])
    .filter((row) => row.event.toLowerCase().includes("delete"))
    .slice(0, 10);
  const trashItemCount =
    Number((stores ?? []).length) +
    Number((archivedPos ?? []).length) +
    Number((archivedStocktakes ?? []).length) +
    Number((archivedBoms ?? []).length);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Trash"
        title="Recovery and purge"
        description="Review archived and inactive records before restoring them or clearing them from the workspace."
        actions={
          <form action={emptyTrash}>
            <button
              className={styles.primary}
              disabled={trashItemCount === 0}
              type="submit"
            >
              {trashItemCount === 0
                ? "Trash is empty"
                : `Empty trash (${trashItemCount})`}
            </button>
          </form>
        }
      />

      <section className={styles.warningPanel}>
        <div>
          <p className={styles.eyebrow}>Destructive action</p>
          <h2>Emptying trash is irreversible</h2>
          <p className={styles.warningBody}>
            Restore anything still needed before clearing archived records from this workspace.
          </p>
        </div>
      </section>

      <div className={styles.grid}>
        <ListPanel
          eyebrow="Stores"
          title="Uninstalled Shopify stores"
          description="Review disconnected stores that still have historical traceability."
        >
          {(stores ?? []).length === 0 ? (
            <EmptyState
              title="No uninstalled stores"
              message="There are no disconnected Shopify stores waiting in trash."
            />
          ) : (
            (stores as StoreRow[]).map((store) => (
              <ListRow key={store.id} columnsTemplate="1fr" className={styles.row}>
                <strong>{store.store_domain}</strong>
                <span className={styles.meta}>
                  Last sync:{" "}
                  {store.last_synced_at
                    ? new Date(store.last_synced_at).toLocaleString("en-AU")
                    : "Never"}
                </span>
              </ListRow>
            ))
          )}
        </ListPanel>

        <ListPanel
          eyebrow="Audit"
          title="Delete activity events"
          description="Recent delete-like events for operator review."
        >
          {deleteLike.length === 0 ? (
            <EmptyState
              title="No delete events logged"
              message="Recent activity does not contain delete-like events."
            />
          ) : (
            deleteLike.map((row) => (
              <ListRow key={row.id} columnsTemplate="1fr" className={styles.row}>
                <strong>{row.event}</strong>
                <span className={styles.meta}>
                  {new Date(row.created_at).toLocaleString("en-AU")}
                </span>
              </ListRow>
            ))
          )}
        </ListPanel>

        <ListPanel
          eyebrow="Purchase orders"
          title="Archived purchase orders"
          description="Restore archived POs if inbound work should be returned to the active flow."
        >
          {(archivedPos ?? []).length === 0 ? (
            <EmptyState
              title="No archived purchase orders"
              message="There are no archived purchase orders waiting for review."
            />
          ) : (
            (archivedPos as ArchivedPoRow[]).map((row) => (
              <ListRow key={row.id} columnsTemplate="1fr" className={styles.row}>
                <strong>
                  PO-{row.id.slice(0, 6)} - {firstOf(row.supplier)?.name ?? "Unknown supplier"}
                </strong>
                <span className={styles.meta}>
                  {new Date(row.created_at).toLocaleString("en-AU")}
                </span>
                <form action={restorePurchaseOrder}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className={styles.restoreBtn} type="submit">
                    Restore
                  </button>
                </form>
              </ListRow>
            ))
          )}
        </ListPanel>

        <ListPanel
          eyebrow="Stocktake"
          title="Archived stocktakes"
          description="Restore a stocktake session if its count history is still needed."
        >
          {(archivedStocktakes ?? []).length === 0 ? (
            <EmptyState
              title="No archived stocktake sessions"
              message="There are no archived stocktake sessions waiting for review."
            />
          ) : (
            (archivedStocktakes as ArchivedStocktakeRow[]).map((row) => (
              <ListRow key={row.id} columnsTemplate="1fr" className={styles.row}>
                <strong>
                  STK-{row.id.slice(0, 6)} - {firstOf(row.location)?.name ?? "Unknown location"}
                </strong>
                <span className={styles.meta}>
                  {new Date(row.created_at).toLocaleString("en-AU")}
                </span>
                <form action={restoreStocktakeSession}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className={styles.restoreBtn} type="submit">
                    Restore
                  </button>
                </form>
              </ListRow>
            ))
          )}
        </ListPanel>

        <ListPanel
          eyebrow="BOM"
          title="Archived BOMs"
          description="Bring archived BOM versions back into the active workspace when needed."
        >
          {(archivedBoms ?? []).length === 0 ? (
            <EmptyState
              title="No archived BOMs"
              message="There are no archived BOM versions waiting for review."
            />
          ) : (
            (archivedBoms as ArchivedBomRow[]).map((row) => (
              <ListRow key={row.id} columnsTemplate="1fr" className={styles.row}>
                <strong>
                  v{row.version} - {firstOf(row.variant)?.title ?? "Untitled variant"}
                </strong>
                <span className={styles.meta}>
                  {new Date(row.created_at).toLocaleString("en-AU")}
                </span>
                <form action={restoreBom}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className={styles.restoreBtn} type="submit">
                    Restore
                  </button>
                </form>
              </ListRow>
            ))
          )}
        </ListPanel>
      </div>
    </div>
  );
}
