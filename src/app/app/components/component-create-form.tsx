"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./components.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type LookupItem = { id: string; name: string };

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  lookups: {
    suppliers: LookupItem[];
    locations: LookupItem[];
    groups: LookupItem[];
  };
};

const initialState: FormState = {};

export default function ComponentCreateForm({ action, lookups }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = React.useActionState(action, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => setOpen(true)}
      >
        + Add Component
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClose={() => setOpen(false)}
      >
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Add Component</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close dialog"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
          </div>

          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Name *</span>
              <input name="name" required placeholder="e.g. Safety Laser Scanner" />
            </label>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>SKU</span>
                <input name="sku" placeholder="e.g. CMP-LASER-001" />
              </label>
              <label className={styles.field}>
                <span>Unit</span>
                <input name="unit" placeholder="ea" />
              </label>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Supplier</span>
                <select name="supplier_id">
                  <option value="">-- None --</option>
                  {lookups.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Group</span>
                <select name="group_id">
                  <option value="">-- None --</option>
                  {lookups.groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Location</span>
              <select name="location_id">
                <option value="">-- None --</option>
                {lookups.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Cost per Unit</span>
                <input
                  name="cost_per_unit"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                />
              </label>
              <label className={styles.field}>
                <span>Reorder Point</span>
                <input
                  name="reorder_point"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue="0"
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Low Stock Level</span>
              <input
                name="low_stock_level"
                type="number"
                step="1"
                min="0"
                defaultValue="0"
              />
              <span className={styles.fieldHint}>
                Triggers a low stock alarm. Should be lower than the reorder point.
              </span>
            </label>

            {state.error && <p className={styles.error}>{state.error}</p>}

            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Create Component
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
