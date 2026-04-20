"use client";

import { useFormState } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { addDepartment, updateRate, removeDepartment } from "./actions";
import styles from "./staff-costings.module.css";

type ActionState = { error?: string; success?: string };
const initial: ActionState = {};

export function AddDepartmentButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(addDepartment, initial);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) d.showModal();
    else d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={styles.addButton} onClick={() => setOpen(true)}>
        + Add Department
      </button>
      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Add Department</h2>
            <button type="button" className={styles.dialogClose} onClick={() => setOpen(false)}>&times;</button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Department Name *</span>
              <input name="name" required placeholder="e.g. Electrical Labour" />
            </label>
            <label className={styles.field}>
              <span>Hourly Rate ($)</span>
              <input name="rate" type="number" step="0.01" min="0" defaultValue="0" placeholder="0.00" />
            </label>
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className={styles.btnSubmit}>Add Department</button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

export function RateEditor({ componentId, currentRate }: { componentId: string; currentRate: number }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState(updateRate, initial);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  if (!editing) {
    return (
      <button type="button" className={styles.rateDisplay} onClick={() => setEditing(true)}>
        ${currentRate.toFixed(2)}
      </button>
    );
  }

  return (
    <form action={formAction} className={styles.rateForm}>
      <input type="hidden" name="component_id" value={componentId} />
      <input
        name="rate"
        type="number"
        step="0.01"
        min="0"
        defaultValue={currentRate}
        className={styles.rateInput}
        autoFocus
      />
      <button type="submit" className={styles.rateSave}>Save</button>
      <button type="button" className={styles.rateCancel} onClick={() => setEditing(false)}>&times;</button>
      {state.error && <span className={styles.error}>{state.error}</span>}
    </form>
  );
}

export function RemoveButton({ componentId }: { componentId: string }) {
  const [state, formAction] = useFormState(removeDepartment, initial);
  return (
    <>
      <form action={formAction} style={{ display: "inline" }}>
        <input type="hidden" name="component_id" value={componentId} />
        <button type="submit" className={styles.removeBtn}>Remove</button>
      </form>
      {state.error && <span className={styles.error}>{state.error}</span>}
    </>
  );
}
