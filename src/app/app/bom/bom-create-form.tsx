"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./bom.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type VariantOption = {
  id: string;
  title: string | null;
  sku: string | null;
};

type Props = {
  variants: VariantOption[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function BomCreateForm({ variants, action }: Props) {
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
        className={styles.primaryBtn}
        onClick={() => setOpen(true)}
      >
        New BOM +
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>New Bill of Materials</h2>
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
              <span>Variant *</span>
              <select name="variant_id" required defaultValue="">
                <option value="">Select variant</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title ?? "Untitled variant"}
                    {v.sku ? ` (${v.sku})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Version</span>
              <input name="version" type="number" min="1" placeholder="Auto" />
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select name="status" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className={styles.checkboxLabel}>
              <input name="is_active" type="checkbox" />
              Set as active BOM
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
                Create BOM
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
