"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import styles from "./purchasing.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type Option = {
  id: string;
  label: string;
};

type Props = {
  purchaseOrders: Option[];
  components: Option[];
  action: (state: FormState, formData: FormData) => Promise<FormState>;
};

const initialState: FormState = {};

export default function PurchaseOrderLineForm({
  purchaseOrders,
  components,
  action,
}: Props) {
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
        Add Line
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Add PO Line</h2>
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
              <span>Purchase Order *</span>
              <select name="purchase_order_id" required defaultValue="">
                <option value="">Select PO</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Component *</span>
              <select name="component_id" required defaultValue="">
                <option value="">Select component</option>
                {components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Quantity *</span>
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
