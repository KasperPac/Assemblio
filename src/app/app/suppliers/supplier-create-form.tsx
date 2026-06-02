"use client";

import { useState, useEffect, useRef, useActionState } from "react";
import styles from "./suppliers.module.css";

type FormState = { error?: string; success?: string };
type Props = { action: (state: FormState, formData: FormData) => Promise<FormState> };

const initialState: FormState = {};

export default function SupplierCreateForm({ action }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialState);
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
      <button type="button" className={styles.addButton} onClick={() => setOpen(true)}>
        + New Supplier
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>New Supplier</h2>
            <button type="button" className={styles.dialogClose} onClick={() => setOpen(false)} aria-label="Close dialog">
              &times;
            </button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Name *</span>
              <input name="name" required placeholder="e.g. Pacific Controls" />
            </label>
            {state.error && <p className={styles.fieldError}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Create Supplier
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
