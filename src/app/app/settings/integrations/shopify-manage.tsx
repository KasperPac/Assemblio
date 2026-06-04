"use client";

import { useState } from "react";
import ShopifyConnect from "./shopify-connect";
import SyncSubmitForm from "./sync-submit-form";
import SyncMetaChips from "./sync-meta-chips";
import { setStatsOnlyBefore } from "./actions";
import styles from "./integrations.module.css";

type Store = {
  id: string;
  store_domain: string;
  status: string;
  created_at: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_meta: Record<string, unknown> | null;
  stats_only_before: string | null;
};

type Props = {
  stores: Store[];
};

export default function ShopifyManage({ stores }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.managePanel}>
      <button
        type="button"
        className={styles.manageToggle}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Manage"}
      </button>

      {open && (
        <div className={styles.manageContent}>
          <ShopifyConnect />

          {stores.length > 0 && (
            <div className={styles.storeList}>
              <p className={styles.storeListHeading}>Connected stores</p>
              {stores.map((store) => (
                <div key={store.id} className={styles.storeRow}>
                  <div className={styles.storeMeta}>
                    <strong>{store.store_domain}</strong>
                    <span className={styles.storeDetail}>
                      Last sync:{" "}
                      {store.last_synced_at
                        ? new Date(store.last_synced_at).toLocaleString("en-AU")
                        : "Never"}
                    </span>
                    <span className={styles.storeDetail}>
                      Status: {store.last_sync_status ?? "unknown"}
                    </span>
                    <SyncMetaChips meta={store.last_sync_meta} />
                    <form action={setStatsOnlyBefore} className={styles.cutoffForm}>
                      <input type="hidden" name="store_id" value={store.id} />
                      <label className={styles.cutoffLabel}>
                        Historical cutoff
                        <input
                          type="date"
                          name="stats_only_before"
                          defaultValue={store.stats_only_before ?? ""}
                          className={styles.cutoffInput}
                        />
                      </label>
                      <button type="submit" className={styles.cutoffSave}>
                        Save
                      </button>
                      <p className={styles.cutoffHint}>
                        Orders placed before this date are imported for stats only (no stock or planning). Re-sync after changing.
                      </p>
                    </form>
                  </div>
                  <div className={styles.storeActions}>
                    <SyncSubmitForm
                      storeId={store.id}
                      buttonLabel="Sync"
                    />
                    <form method="post" action="/api/shopify/disconnect">
                      <input type="hidden" name="store_id" value={store.id} />
                      <button type="submit" className={styles.disconnectButton}>
                        Disconnect
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
