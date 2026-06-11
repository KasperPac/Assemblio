"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createLaborTemplate,
  updateLaborTemplateMode,
  deleteLaborTemplate,
  setLaborTemplateLines,
  type LaborTemplateLineInput,
} from "./actions";
import styles from "./templates.module.css";

type ActionState = { error?: string; success?: string };
const initialState: ActionState = {};

export type DepartmentOption = { id: string; name: string };

export type LaborLineDraft = LaborTemplateLineInput & { key: string };

export function CreateLaborTemplateButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createLaborTemplate, initialState);
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
        + New template
      </button>
      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setOpen(false)}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>New Labor Template</h2>
            <button type="button" className={styles.dialogClose} onClick={() => setOpen(false)}>
              &times;
            </button>
          </div>
          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Name *</span>
              <input name="name" required placeholder="e.g. CNC + Assembly Route" />
            </label>
            <label className={styles.field}>
              <span>Description</span>
              <textarea name="description" rows={3} placeholder="What this routing covers..." />
            </label>
            <label className={styles.field}>
              <span>Mode</span>
              <select name="mode" defaultValue="basic">
                <option value="basic">Basic — departments and operations only</option>
                <option value="advanced">Advanced — all labor-line fields</option>
              </select>
            </label>
            {state.error && <p className={styles.error}>{state.error}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Create Template
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

export function ModeSwitch({
  templateId,
  mode,
}: {
  templateId: string;
  mode: "basic" | "advanced";
}) {
  const [, formAction] = useActionState(updateLaborTemplateMode, initialState);
  const next = mode === "basic" ? "advanced" : "basic";
  return (
    <form action={formAction} className={styles.inlineForm}>
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="mode" value={next} />
      <button type="submit" className={styles.btnSmall}>
        Switch to {next}
      </button>
    </form>
  );
}

export function DeleteLaborTemplateButton({
  templateId,
  usedByCount,
}: {
  templateId: string;
  usedByCount: number;
}) {
  const [, formAction] = useActionState(deleteLaborTemplate, initialState);
  return (
    <form
      action={formAction}
      className={styles.inlineForm}
      onSubmit={(e) => {
        if (
          usedByCount > 0 &&
          !window.confirm(
            `Used by ${usedByCount} BOM${usedByCount === 1 ? "" : "s"} — they will keep their lines but lose the link. Delete template?`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="template_id" value={templateId} />
      <button type="submit" className={styles.deleteTplBtn}>
        Delete
      </button>
    </form>
  );
}

let draftCounter = 0;
function newKey() {
  draftCounter += 1;
  return `draft-${draftCounter}`;
}

export function LaborEditorDialog({
  templateId,
  templateName,
  mode,
  existingLines,
  departments,
}: {
  templateId: string;
  templateName: string;
  mode: "basic" | "advanced";
  existingLines: LaborTemplateLineInput[];
  departments: DepartmentOption[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LaborLineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openDialog() {
    setRows(existingLines.map((l) => ({ ...l, key: newKey() })));
    setError(null);
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    setOpen(false);
    dialogRef.current?.close();
  }

  function update(key: string, patch: Partial<LaborTemplateLineInput>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        department_id: departments[0]?.id ?? "",
        operation_name: "",
        sequence: prev.length + 1,
        setup_hours: 0,
        run_hours_per_unit: 0,
        admin_hours_per_unit: 0,
        electricity_kwh_per_unit: 0,
        gas_units_per_unit: 0,
        notes: null,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await setLaborTemplateLines(
      templateId,
      rows.map(({ key: _key, ...line }) => line)
    );
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    closeDialog();
  }

  return (
    <>
      <button type="button" className={styles.btnSmall} onClick={openDialog}>
        Edit operations
      </button>
      <dialog ref={dialogRef} className={`${styles.dialog} ${styles.dialogWide}`} onClose={() => setOpen(false)}>
        <div className={styles.dialogInnerWide}>
          <div className={styles.dialogHeader}>
            <h2>Edit Operations</h2>
            <button type="button" className={styles.dialogClose} onClick={closeDialog}>
              &times;
            </button>
          </div>
          <p className={styles.dialogSub}>
            {templateName} · {mode === "basic" ? "Basic (times filled per BOM)" : "Advanced"}
          </p>
          {open && (
            <div className={styles.laborEditor}>
              {rows.map((row) => (
                <div key={row.key} className={styles.laborEditorRow}>
                  <label className={styles.field}>
                    <span>Seq</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={row.sequence}
                      onChange={(e) => update(row.key, { sequence: Number(e.target.value) })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Operation *</span>
                    <input
                      value={row.operation_name}
                      onChange={(e) => update(row.key, { operation_name: e.target.value })}
                      placeholder="e.g. CNC Milling"
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Department *</span>
                    <select
                      value={row.department_id}
                      onChange={(e) => update(row.key, { department_id: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mode === "advanced" && (
                    <>
                      <label className={styles.field}>
                        <span>Setup h</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.setup_hours}
                          onChange={(e) =>
                            update(row.key, { setup_hours: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Run h/u</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.run_hours_per_unit}
                          onChange={(e) =>
                            update(row.key, { run_hours_per_unit: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Admin h/u</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.admin_hours_per_unit}
                          onChange={(e) =>
                            update(row.key, { admin_hours_per_unit: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>kWh/u</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.electricity_kwh_per_unit}
                          onChange={(e) =>
                            update(row.key, {
                              electricity_kwh_per_unit: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Gas/u</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.gas_units_per_unit}
                          onChange={(e) =>
                            update(row.key, { gas_units_per_unit: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Notes</span>
                        <input
                          value={row.notes ?? ""}
                          onChange={(e) =>
                            update(row.key, { notes: e.target.value || null })
                          }
                        />
                      </label>
                    </>
                  )}
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button type="button" className={styles.btnSmall} onClick={addRow}>
                + Add operation
              </button>
              {error && <p className={styles.error}>{error}</p>}
              <div className={styles.dialogActions}>
                <button type="button" className={styles.btnCancel} onClick={closeDialog}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnSubmit}
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save operations"}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
