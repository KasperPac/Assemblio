"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./purchasing.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type SupplierOption = {
  id: string;
  name: string | null;
};

type Props = {
  suppliers: SupplierOption[];
  nextPoNumber: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function PurchaseOrderCreateForm({ suppliers, nextPoNumber, action }: Props) {
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
        New PO +
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>New Purchase Order</h2>
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
              <span>PO Number</span>
              <input name="po_number" defaultValue={nextPoNumber} placeholder="e.g. PO-2506001" />
            </label>
            <label className={styles.field}>
              <span>Supplier *</span>
              <select name="supplier_id" required defaultValue="">
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name ?? "Unnamed supplier"}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select name="status" defaultValue="open">
                <option value="open">Open</option>
                <option value="in_transit">In Transit</option>
                <option value="received">Received</option>
              </select>
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
                Create PO
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
