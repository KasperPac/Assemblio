"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./bom.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Option = {
  id: string;
  label: string;
};

type Props = {
  boms: Option[];
  components: Option[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function BomComponentLineForm({ boms, components, action }: Props) {
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
        className={styles.secondaryBtn}
        onClick={() => setOpen(true)}
      >
        Add Component Line
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Add Component Line</h2>
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
              <span>BOM *</span>
              <select name="product_bom_id" required defaultValue="">
                <option value="">Select BOM</option>
                {boms.map((bom) => (
                  <option key={bom.id} value={bom.id}>
                    {bom.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Component *</span>
              <select name="component_id" required defaultValue="">
                <option value="">Select component</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Qty / unit *</span>
              <input name="quantity" type="number" step="0.01" min="0.01" required />
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
                Add Line
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
