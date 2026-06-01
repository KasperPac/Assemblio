"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { createComponentGroup } from "./actions";
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
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = React.useActionState(action, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Group state
  const [groups, setGroups] = useState<LookupItem[]>(lookups.groups);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPending, setNewGroupPending] = useState(false);
  const [newGroupError, setNewGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      resetNewGroupForm();
    }
  }, [state.success]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  function resetNewGroupForm() {
    setShowNewGroup(false);
    setNewGroupName("");
    setNewGroupError(null);
  }

  function handleClose() {
    setOpen(false);
    resetNewGroupForm();
  }

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setNewGroupPending(true);
    setNewGroupError(null);
    try {
      const result = await createComponentGroup(trimmed);
      if ("error" in result) {
        setNewGroupError(result.error);
      } else {
        setGroups((prev) => [...prev, result.group]);
        setSelectedGroupId(result.group.id);
        resetNewGroupForm();
      }
    } finally {
      setNewGroupPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => { setOpen(true); setFormKey((k) => k + 1); }}
      >
        + Add Component
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClose={handleClose}
      >
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Add Component</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close dialog"
              onClick={handleClose}
            >
              &times;
            </button>
          </div>

          <form key={formKey} action={formAction} className={styles.dialogForm}>
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
              <div className={styles.field}>
                <label htmlFor="group_id">Group</label>
                <select
                  id="group_id"
                  name="group_id"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  <option value="">-- None --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {!showNewGroup ? (
                  <button
                    type="button"
                    className={styles.newGroupLink}
                    onClick={() => setShowNewGroup(true)}
                  >
                    + New group
                  </button>
                ) : (
                  <div className={styles.newGroupForm}>
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateGroup();
                        }
                      }}
                      placeholder="e.g. Pneumatics"
                      autoFocus
                    />
                    {newGroupError && (
                      <p className={styles.newGroupError}>{newGroupError}</p>
                    )}
                    <div className={styles.newGroupActions}>
                      <button
                        type="button"
                        className={styles.btnSubmit}
                        disabled={newGroupPending || !newGroupName.trim()}
                        onClick={handleCreateGroup}
                      >
                        {newGroupPending ? "Creating…" : "Create"}
                      </button>
                      <button
                        type="button"
                        className={styles.btnCancel}
                        onClick={resetNewGroupForm}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
                onClick={handleClose}
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
