"use client";

import styles from "./sla-form.module.css";
import { updateOrderSourceSla } from "./actions";

type Props = {
  shopifyDays: number;
  manualDays: number;
};

export default function SlaForm({ shopifyDays, manualDays }: Props) {
  return (
    <form action={updateOrderSourceSla} className={styles.form}>
      <div className={styles.row}>
        <label htmlFor="shopify_days">Shopify orders lead time (days)</label>
        <input
          id="shopify_days"
          name="shopify_days"
          type="number"
          min={0}
          defaultValue={shopifyDays}
          className={styles.input}
        />
      </div>
      <div className={styles.row}>
        <label htmlFor="manual_days">Manual orders lead time (days)</label>
        <input
          id="manual_days"
          name="manual_days"
          type="number"
          min={0}
          defaultValue={manualDays}
          className={styles.input}
        />
      </div>
      <button type="submit" className={styles.submit}>
        Save
      </button>
      <p className={styles.meta}>
        Changes apply to <strong>new</strong> orders. Existing orders keep their
        target ship date.
      </p>
    </form>
  );
}
