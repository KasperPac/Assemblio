import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./trash.module.css";
import { emptyTrash, restoreBom, restorePurchaseOrder, restoreStocktakeSession } from "./actions";

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
  const supabase = await createSupabaseServerClient();
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
      .eq("status", "uninstalled")
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("id,event,created_at,metadata")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("purchase_order")
      .select("id,status,created_at,supplier:supplier_id(name)")
      .eq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("stocktake_session")
      .select("id,status,created_at,location:location_id(name)")
      .eq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("product_bom")
      .select("id,version,status,created_at,variant:variant_id(title,sku)")
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
      <div className={styles.header}>
        <div>
          <h1>Trash</h1>
          <p>Recoverable or inactive records requiring review.</p>
        </div>
        <form action={emptyTrash}>
          <button className={styles.primary} disabled={trashItemCount === 0} type="submit">
            {trashItemCount === 0 ? "Trash is Empty" : `Empty Trash (${trashItemCount})`}
          </button>
        </form>
      </div>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h3>Uninstalled Shopify Stores</h3>
          {(stores ?? []).length === 0 ? (
            <p>No uninstalled stores.</p>
          ) : (
            <div className={styles.list}>
              {(stores as StoreRow[]).map((store) => (
                <div key={store.id} className={styles.row}>
                  <span>{store.store_domain}</span>
                  <span>
                    Last sync: {store.last_synced_at ? new Date(store.last_synced_at).toLocaleString() : "Never"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h3>Delete Activity Events</h3>
          {deleteLike.length === 0 ? (
            <p>No delete events logged.</p>
          ) : (
            <div className={styles.list}>
              {deleteLike.map((row) => (
                <div key={row.id} className={styles.row}>
                  <span>{row.event}</span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h3>Archived Purchase Orders</h3>
          {(archivedPos ?? []).length === 0 ? (
            <p>No archived purchase orders.</p>
          ) : (
            <div className={styles.list}>
              {(archivedPos as ArchivedPoRow[]).map((row) => (
                <div key={row.id} className={styles.row}>
                  <span>
                    PO-{row.id.slice(0, 6)} - {firstOf(row.supplier)?.name ?? "Unknown supplier"}
                  </span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                  <form action={restorePurchaseOrder}>
                    <input type="hidden" name="id" value={row.id} />
                    <button className={styles.restoreBtn} type="submit">
                      Restore
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h3>Archived Stocktakes</h3>
          {(archivedStocktakes ?? []).length === 0 ? (
            <p>No archived stocktake sessions.</p>
          ) : (
            <div className={styles.list}>
              {(archivedStocktakes as ArchivedStocktakeRow[]).map((row) => (
                <div key={row.id} className={styles.row}>
                  <span>
                    STK-{row.id.slice(0, 6)} - {firstOf(row.location)?.name ?? "Unknown location"}
                  </span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                  <form action={restoreStocktakeSession}>
                    <input type="hidden" name="id" value={row.id} />
                    <button className={styles.restoreBtn} type="submit">
                      Restore
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h3>Archived BOMs</h3>
          {(archivedBoms ?? []).length === 0 ? (
            <p>No archived BOMs.</p>
          ) : (
            <div className={styles.list}>
              {(archivedBoms as ArchivedBomRow[]).map((row) => (
                <div key={row.id} className={styles.row}>
                  <span>
                    v{row.version} - {firstOf(row.variant)?.title ?? "Untitled variant"}
                  </span>
                  <span>{new Date(row.created_at).toLocaleString()}</span>
                  <form action={restoreBom}>
                    <input type="hidden" name="id" value={row.id} />
                    <button className={styles.restoreBtn} type="submit">
                      Restore
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
