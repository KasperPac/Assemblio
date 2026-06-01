"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { createMovement } from "./actions";
import styles from "./inventory.module.css";

type SelectOption = {
  id: string;
  name: string | null;
  sku?: string | null;
  is_default?: boolean | null;
};

type Props = {
  components: SelectOption[];
  locations: SelectOption[];
};

const initialState = { error: "", success: "" };

type MovementType = "receipt" | "allocation" | "adjustment" | "production";

export default function MovementForm({ components, locations }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createMovement, initialState);
  const [movementType, setMovementType] = useState<MovementType>("receipt");
  const [deltaOnHand, setDeltaOnHand] = useState<string>("0");
  const [deltaInProd, setDeltaInProd] = useState<string>("0");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handleClose = () => {
    setOpen(false);
    setDeltaOnHand("0");
    setDeltaInProd("0");
    setMovementType("receipt");
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state.success) handleClose();
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
        className={styles.primary}
        onClick={() => setOpen(true)}
      >
        Log Movement +
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClose={handleClose}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Log Inventory Movement</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close dialog"
              onClick={handleClose}
            >
              &times;
            </button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Component *</span>
                <select name="component_id" required>
                  <option value="">Select component</option>
                  {components.map((component) => (
                    <option key={component.id} value={component.id}>
                      {component.name ?? "Unnamed"}
                      {component.sku ? ` (${component.sku})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Location *</span>
                <select name="location_id" required>
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name ?? "Unnamed"}
                      {location.is_default ? " — default" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Reason</span>
                <select
                  name="reason"
                  value={movementType}
                  onChange={(event) => {
                    setMovementType(event.target.value as MovementType);
                  }}
                >
                  <option value="receipt">Receipt</option>
                  <option value="allocation">Allocation</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="production">Production</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Delta on-hand</span>
                <input
                  name="delta_on_hand"
                  type="number"
                  step="0.01"
                  required
                  min="-999999"
                  value={deltaOnHand}
                  onChange={(event) => setDeltaOnHand(event.target.value)}
                />
              </label>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Delta in-prod</span>
                <input
                  name="delta_in_prod"
                  type="number"
                  step="0.01"
                  required
                  min="-999999"
                  value={deltaInProd}
                  onChange={(event) => setDeltaInProd(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Reference type</span>
                <input name="reference_type" type="text" placeholder="order" />
              </label>
            </div>
            <label className={styles.field}>
              <span>Reference ID</span>
              <input name="reference_id" type="text" placeholder="uuid" />
            </label>
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Save Movement
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
