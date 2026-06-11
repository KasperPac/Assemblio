"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
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

export function LaborLinesEditor({
  templateId,
  mode,
  existingLines,
  departments,
}: {
  templateId: string;
  mode: "basic" | "advanced";
  existingLines: LaborTemplateLineInput[];
  departments: DepartmentOption[];
}) {
  const [rows, setRows] = useState<LaborLineDraft[]>(() =>
    existingLines.map((l) => ({ ...l, key: newKey() }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        sequence: prev.reduce((max, r) => Math.max(max, r.sequence), 0) + 1,
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
    try {
      const result = await setLaborTemplateLines(
        templateId,
        rows.map(({ key: _key, ...line }) => line)
      );
      if (result.error) setError(result.error);
    } catch {
      setError("Something went wrong saving operations. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const gridClass = mode === "advanced" ? styles.labEditGridAdvanced : styles.labEditGridBasic;

  return (
    <div className={styles.laborInlineEditor}>
      <div className={gridClass}>
        <span className={styles.colHeader}>#</span>
        <span className={styles.colHeader}>Operation</span>
        <span className={styles.colHeader}>Department</span>
        {mode === "advanced" && (
          <>
            <span className={styles.colHeader}>Setup h</span>
            <span className={styles.colHeader}>Run h/u</span>
            <span className={styles.colHeader}>Admin h/u</span>
            <span className={styles.colHeader}>kWh/u</span>
            <span className={styles.colHeader}>Gas/u</span>
            <span className={styles.colHeader}>Notes</span>
          </>
        )}
        <span />
        {rows.map((row) => (
          <Fragment key={row.key}>
            <input
              type="number"
              min={1}
              step={1}
              value={row.sequence}
              onChange={(e) => update(row.key, { sequence: Number(e.target.value) })}
              aria-label="Sequence"
            />
            <input
              value={row.operation_name}
              onChange={(e) => update(row.key, { operation_name: e.target.value })}
              placeholder="e.g. CNC Milling"
              aria-label="Operation"
            />
            <select
              value={row.department_id}
              onChange={(e) => update(row.key, { department_id: e.target.value })}
              aria-label="Department"
            >
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {mode === "advanced" && (
              <>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.setup_hours}
                  onChange={(e) => update(row.key, { setup_hours: Number(e.target.value) })}
                  aria-label="Setup hours"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.run_hours_per_unit}
                  onChange={(e) => update(row.key, { run_hours_per_unit: Number(e.target.value) })}
                  aria-label="Run hours per unit"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.admin_hours_per_unit}
                  onChange={(e) => update(row.key, { admin_hours_per_unit: Number(e.target.value) })}
                  aria-label="Admin hours per unit"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.electricity_kwh_per_unit}
                  onChange={(e) =>
                    update(row.key, { electricity_kwh_per_unit: Number(e.target.value) })
                  }
                  aria-label="Electricity kWh per unit"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.gas_units_per_unit}
                  onChange={(e) => update(row.key, { gas_units_per_unit: Number(e.target.value) })}
                  aria-label="Gas units per unit"
                />
                <input
                  value={row.notes ?? ""}
                  onChange={(e) => update(row.key, { notes: e.target.value || null })}
                  aria-label="Notes"
                />
              </>
            )}
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              aria-label="Remove operation"
            >
              &times;
            </button>
          </Fragment>
        ))}
      </div>
      <div className={styles.expAddRow}>
        <button type="button" className={styles.addComponentsBtn} onClick={addRow}>
          + Add operation
        </button>
        <button type="button" className={styles.btnSmall} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save operations"}
        </button>
      </div>
      {error && <p className={styles.expError}>{error}</p>}
    </div>
  );
}
