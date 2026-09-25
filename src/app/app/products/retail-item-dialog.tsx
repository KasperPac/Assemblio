"use client";

import React, { useEffect, useRef, useState } from "react";
import { createRetailItem, type RetailItemState } from "./retail-actions";
import styles from "./retail-item-dialog.module.css";

type Option = { id: string; name: string };

type Props = {
  mode: "create" | "attach";
  variantId?: string;
  defaultName?: string;
  defaultSku?: string | null;
  suppliers: Option[];
  locations: Option[];
};

const initialState: RetailItemState = {};

export default function RetailItemDialog({ mode, variantId, defaultName, defaultSku, suppliers, locations }: Props) {
  const [state, formAction, pending] = React.useActionState(createRetailItem, initialState);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  const title = mode === "create" ? "New retail item" : "Track as retail item";

  return (
    <>
      <button type="button" className={mode === "create" ? styles.primaryBtn : styles.secondaryBtn} onClick={() => setOpen(true)}>
        {title}
      </button>
      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <form action={formAction} className={styles.form}>
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>
          <p className={styles.hint}>
            A product you buy in and sell unchanged. Manuva tracks its shelf stock and takes it
            off when an order is fulfilled.
          </p>
          {variantId ? <input type="hidden" name="variant_id" value={variantId} /> : null}
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input name="name" required defaultValue={defaultName} className={styles.input} />
          </label>
          {mode === "create" ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>SKU</span>
                <input name="sku" defaultValue={defaultSku ?? ""} className={styles.input} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Barcode</span>
                <input name="barcode" inputMode="numeric" className={styles.input} />
              </label>
            </>
          ) : null}
          <label className={styles.field}>
            <span className={styles.label}>Unit cost</span>
            <input name="cost_per_unit" type="number" min="0" step="0.01" className={styles.input} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Reorder point</span>
            <input name="reorder_point" type="number" min="0" step="1" className={styles.input} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Supplier</span>
            <select name="supplier_id" className={styles.input} defaultValue="">
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Stock location</span>
            <select name="location_id" className={styles.input} defaultValue="">
              <option value="">Default location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={styles.primaryBtn} disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create" : "Track stock"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
