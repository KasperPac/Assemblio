"use client";

import { useState } from "react";
import styles from "./settings.module.css";

type Props = {
  storeId?: string;
  buttonClassName: string;
  buttonLabel: string;
};

export default function SyncSubmitForm({ storeId, buttonClassName, buttonLabel }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <>
      <form
        method="post"
        action="/api/shopify/sync"
        onSubmit={() => setIsSubmitting(true)}
      >
        {storeId ? <input type="hidden" name="store_id" value={storeId} /> : null}
        <button type="submit" className={buttonClassName} disabled={isSubmitting}>
          {isSubmitting ? "Syncing..." : buttonLabel}
        </button>
      </form>
      {isSubmitting ? (
        <div className={styles.syncOverlay} role="status" aria-live="polite">
          <div className={styles.syncModal}>
            <h4>Sync in Progress</h4>
            <p>This may take a minute.</p>
            <div className={styles.syncProgressTrack} aria-hidden="true">
              <div className={styles.syncProgressBar} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
