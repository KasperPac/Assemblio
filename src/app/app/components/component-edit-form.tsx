"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { updateComponent, createComponentGroup } from "./actions";
import styles from "./components.module.css";

type FormState = { error?: string; success?: string };
type LookupItem = { id: string; name: string };

type InitialValues = {
  name: string;
  sku: string | null;
  unit: string | null;
  costPerUnit: number;
  reorderPoint: number;
  lowStockLevel: number;
  supplierId: string | null;
  groupId: string | null;
};

type Props = {
  componentId: string;
  initialValues: InitialValues;
  lookups: {
    suppliers: LookupItem[];
    groups: LookupItem[];
  };
};

const initialState: FormState = {};

export default function ComponentEditForm({ componentId, initialValues, lookups }: Props) {
  const [open, setOpen] = useState(false);
  const boundAction = updateComponent.bind(null, componentId);
  const [state, formAction] = React.useActionState(boundAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Group state
  const [groups, setGroups] = useState<LookupItem[]>(lookups.groups);
  const [selectedGroupId, setSelectedGroupId] = useState(initialValues.groupId ?? "");
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
    else if (dialog.open) dialog.close();
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
        className={styles.editButton}
        onClick={() => setOpen(true)}
        aria-label="Edit component"
      >
        ✎ Edit
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClose={handleClose}
      >
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Edit Component</h2>
            <button
              type="button"
              className={styles.dialogClose}
              onClick={handleClose}
              aria-label="Close dialog"
            >
              &times;
            </button>
          </div>

          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Name *</span>
              <input name="name" required defaultValue={initialValues.name} />
            </label>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>SKU</span>
                <input name="sku" defaultValue={initialValues.sku ?? ""} />
              </label>
              <label className={styles.field}>
                <span>Unit</span>
                <input name="unit" defaultValue={initialValues.unit ?? ""} placeholder="ea" />
              </label>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Supplier</span>
                <select name="supplier_id" defaultValue={initialValues.supplierId ?? ""}>
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
                      aria-label="New group name"
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

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Cost per Unit</span>
                <input name="cost_per_unit" type="number" step="0.01" min="0" defaultValue={initialValues.costPerUnit} />
              </label>
              <label className={styles.field}>
                <span>Reorder Point</span>
                <input name="reorder_point" type="number" step="1" min="0" defaultValue={initialValues.reorderPoint} />
              </label>
            </div>

            <label className={styles.field}>
              <span>Low Stock Level</span>
              <input name="low_stock_level" type="number" step="1" min="0" defaultValue={initialValues.lowStockLevel} />
              <span className={styles.fieldHint}>Should be lower than the reorder point.</span>
            </label>

            {state.error && <p className={styles.error}>{state.error}</p>}

            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnCancel} onClick={handleClose}>
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>Save Changes</button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
