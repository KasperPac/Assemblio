# Templates Page UI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the big-card templates page with a compact design-system table where clicking a row expands it inline into an editor (accordion), per spec `docs/superpowers/specs/2026-06-12-templates-ui-rework-design.md`.

**Architecture:** Pure UI rework. `page.tsx` stays a server component that fetches data and maps it into serializable row props. A new client component `template-table.tsx` renders one design-system table per tab with one-row-at-a-time inline expansion. The expansion IS the editor: qty inputs commit on blur via `setTemplateLines`; labor operations edit in an inline grid saved via `setLaborTemplateLines`. "+ Add components" opens the existing `ComponentPicker` in a lightbox. All server actions are reused unchanged.

**Tech Stack:** Next.js 15 App Router, React client components, CSS Modules composing `_ui/table.module.css` and `_ui/buttons.module.css`, existing server actions in `src/app/app/templates/actions.ts`.

**Branch:** Work directly on `main` (user preference). Commit per task. Do NOT stage unrelated untracked files (docs/review/, *.html, *.png, resize-icon.py) — stage files by exact name only.

**Verification baselines (treat as pass):**
- `npx tsc --noEmit` → exactly 2 errors, both in `.next/types/validator.ts`. ZERO errors under `src/`.
- `npx vitest run --pool threads --maxWorkers 1` → 2 pre-existing failures (`src/lib/allocation/engine.test.ts`, `src/lib/inventory/invariants.test.ts`). All other suites pass.

**No new unit tests:** this is a UI-only rework; the repo has no component-test infrastructure (vitest suites cover pure logic only, e.g. `publish.test.ts`, `affected.test.ts`, which are untouched). Verification is type-check + existing suites + manual checks listed per task.

---

## Existing code you will reuse (do not modify)

- `src/app/app/templates/actions.ts` — server actions:
  - `setTemplateLines(templateId: string, lines: { component_id: string; quantity: number }[]): Promise<{ error?: string }>` — deletes all lines then re-inserts; revalidates the page.
  - `setLaborTemplateLines(templateId: string, lines: LaborTemplateLineInput[]): Promise<{ error?: string }>` — validates (department + name required, positive integer sequences, non-negative numbers), replaces lines.
  - `type LaborTemplateLineInput = { department_id: string; operation_name: string; sequence: number; setup_hours: number; run_hours_per_unit: number; admin_hours_per_unit: number; electricity_kwh_per_unit: number; gas_units_per_unit: number; notes: string | null }`
  - `removeTemplateLine`, `deleteTemplate`, `deleteLaborTemplate`, `createTemplate`, `createLaborTemplate`, `updateLaborTemplateMode` (FormData actions used via `useActionState`).
- `src/app/app/templates/affected.ts` — `computeAffectedBoms(rows, field, id): AffectedBom[]`, `hasUnpublishedChanges(t)`, `unwrap(val)`, types `AffectedBom`, `LinkedBomRow`.
- `src/app/app/templates/link-controls.tsx` — `LinkControls({ templateType, templateId, isLinked, hasUnpublished, affectedBoms })` — link toggle + tooltip + publish dialog. Uses classes from `templates.module.css`: `linkToggle, knob, knobOn, infoWrap, infoIcon, tooltip, publishBtn, publishList, publishRow, publishIdentity, publishMeta, versionChip, publishWarn, dialog, dialogInner, dialogHeader, dialogClose, dialogActions, btnCancel, btnSubmit, error` — keep all of these in the CSS cleanup task.
- `src/app/app/products/_components/component-picker.tsx` — `ComponentPicker({ components, initialSelection, saveLabel, onSave })`, `type ComponentOption`.
- `src/app/app/products/bom-lightbox.module.css` — lightbox shell classes `overlay, backdrop, panelWide, panelHeader, panelSub, closeBtn`.
- `src/lib/bom/qty-input.ts` — `parseQtyInput(raw: string): number | null` (null for empty/non-numeric/≤0).
- `src/app/app/_ui/table.module.css` — `tableCard`, `table` (th = caps on `--bg-card-alt`, td dividers `--stroke`, row hover `--surface-hover`).
- `src/app/app/_ui/status-badge.tsx` — `<StatusBadge variant="success|warning|danger|info">label</StatusBadge>` (no variant = neutral).
- `src/app/app/_ui/empty-state.tsx`, `src/app/app/_ui/page-header.tsx`.

---

### Task 1: Rename `TemplateLightbox` → `TemplatePickerLightbox` with "+ Add components" trigger

**Goal:** The picker lightbox becomes the expansion's "+ Add components" affordance: secondary-style trigger button, "Add components" header, "Save template" save label.

**Files:**
- Modify: `src/app/app/templates/template-forms.tsx:105-172`
- Modify: `src/app/app/templates/page.tsx:374-382` (call site rename only — full page rework happens in Task 3)
- Modify: `src/app/app/templates/templates.module.css` (add one class)

**Acceptance Criteria:**
- [ ] `TemplatePickerLightbox` exported from `template-forms.tsx`; `TemplateLightbox` no longer exists anywhere (`grep -r "TemplateLightbox" src/` → no matches)
- [ ] Trigger button reads "+ Add components" and composes the secondary button style
- [ ] Dialog header reads "Add components"; `saveLabel` is `"Save template"`
- [ ] `npx tsc --noEmit` → baseline only (2 errors in `.next/types/validator.ts`)

**Verify:** `npx tsc --noEmit` → 2 baseline errors only. `grep -rn "TemplateLightbox" src/` → only `TemplatePickerLightbox` matches.

**Steps:**

- [ ] **Step 1: Rework the component in `template-forms.tsx`**

Replace the entire `TemplateLightbox` function (lines 105-172) with:

```tsx
export function TemplatePickerLightbox({
  templateId,
  templateName,
  existingLines,
  components,
}: {
  templateId: string;
  templateName: string;
  existingLines: { component_id: string; quantity: number }[];
  components: ComponentOption[];
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const initialSelection = useMemo(() => {
    const sel: Record<string, number> = {};
    for (const line of existingLines) {
      sel[line.component_id] = line.quantity;
    }
    return sel;
  }, [existingLines]);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    setOpen(false);
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" className={styles.addComponentsBtn} onClick={openDialog}>
        + Add components
      </button>

      <dialog ref={dialogRef} className={lightboxStyles.overlay} onClose={() => setOpen(false)}>
        <div className={lightboxStyles.backdrop} onClick={closeDialog} />
        <div className={lightboxStyles.panelWide}>
          <div className={lightboxStyles.panelHeader}>
            <div>
              <h2>Add components</h2>
              <p className={lightboxStyles.panelSub}>{templateName}</p>
            </div>
            <button type="button" className={lightboxStyles.closeBtn} onClick={closeDialog}>
              &times;
            </button>
          </div>

          {open && (
            <ComponentPicker
              components={components}
              initialSelection={initialSelection}
              saveLabel="Save template"
              onSave={async (lines) => {
                const result = await setTemplateLines(templateId, lines);
                if (result.error) return { error: result.error };
                closeDialog();
              }}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
```

(Only the function name, trigger button class/label, header text, and save label change — the body is otherwise identical to the current `TemplateLightbox`.)

- [ ] **Step 2: Add the trigger-button class to `templates.module.css`**

Append:

```css
/* Expansion "+ Add components" trigger */
.addComponentsBtn {
  composes: secondary from "../_ui/buttons.module.css";
  font-size: var(--fs-sm);
  padding: 6px 14px;
  min-height: 34px;
}
```

- [ ] **Step 3: Update the call site in `page.tsx`**

In `src/app/app/templates/page.tsx`, change the import (line 10) from `TemplateLightbox` to `TemplatePickerLightbox`, and the JSX usage (line 374) from `<TemplateLightbox` to `<TemplatePickerLightbox` (props unchanged).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exactly 2 errors, both in `.next/types/validator.ts`.

Run: `grep -rn "TemplateLightbox" src/`
Expected: matches only for `TemplatePickerLightbox`.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/templates/template-forms.tsx src/app/app/templates/page.tsx src/app/app/templates/templates.module.css
git commit -m "refactor(templates): TemplateLightbox becomes TemplatePickerLightbox with add-components trigger"
```

---

### Task 2: Inline `LaborLinesEditor` component

**Goal:** An inline labor-operations grid editor (extracted from `LaborEditorDialog`'s internals) that renders directly in a row expansion — no dialog shell.

**Files:**
- Modify: `src/app/app/templates/labor-template-forms.tsx` (add `LaborLinesEditor`; keep `LaborEditorDialog` for now — it is deleted in Task 4 once nothing renders it)
- Modify: `src/app/app/templates/templates.module.css` (editor grid classes)

**Acceptance Criteria:**
- [ ] `LaborLinesEditor({ templateId, mode, existingLines, departments })` exported from `labor-template-forms.tsx`
- [ ] Grid columns: sequence (integer input `min={1} step={1}`), operation name, department select; advanced mode adds setup h, run h/u, admin h/u, kWh/u, gas/u, notes. Basic mode hides those inputs but the row state preserves their values
- [ ] "+ Add operation" appends a row with the next free sequence (`max(sequence) + 1`)
- [ ] ✕ removes a row; "Save operations" calls `setLaborTemplateLines` with all rows; inline error text (`--danger`, `--fs-xs`) on failure
- [ ] `npx tsc --noEmit` → baseline only

**Verify:** `npx tsc --noEmit` → 2 baseline errors only.

**Steps:**

- [ ] **Step 1: Add `LaborLinesEditor` to `labor-template-forms.tsx`**

Add `Fragment` to the React import at the top of the file:

```tsx
import { Fragment, useActionState, useEffect, useRef, useState } from "react";
```

Then append this component at the end of the file (it reuses the module-level `newKey()` helper and `LaborLineDraft` type already in the file):

```tsx
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
    const result = await setLaborTemplateLines(
      templateId,
      rows.map(({ key: _key, ...line }) => line)
    );
    setSaving(false);
    if (result.error) setError(result.error);
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
```

Note: rows are seeded from props once on mount. That is correct here because Task 3/4 render the editor only while a row is expanded — collapsing unmounts it, so re-expanding remounts with fresh server data.

- [ ] **Step 2: Add editor CSS to `templates.module.css`**

Append:

```css
/* Inline labor lines editor (row expansion) */
.laborInlineEditor {
  display: grid;
  gap: 10px;
}
.labEditGridBasic {
  display: grid;
  grid-template-columns: 56px minmax(0, 1.4fr) minmax(0, 1fr) 36px;
  gap: 6px 10px;
  align-items: center;
}
.labEditGridAdvanced {
  display: grid;
  grid-template-columns: 48px minmax(0, 1.3fr) minmax(0, 1fr) 70px 70px 70px 70px 70px minmax(0, 1fr) 32px;
  gap: 6px 8px;
  align-items: center;
}
.labEditGridBasic input,
.labEditGridBasic select,
.labEditGridAdvanced input,
.labEditGridAdvanced select {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  padding: 5px 8px;
  font-size: var(--fs-sm);
  background: var(--bg-card);
  color: var(--ink-strong);
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

/* Shared expansion bits (also used by Task 3) */
.expAddRow {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.expError {
  margin: 8px 0 0;
  font-size: var(--fs-xs);
  color: var(--danger);
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: exactly 2 errors, both in `.next/types/validator.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/templates/labor-template-forms.tsx src/app/app/templates/templates.module.css
git commit -m "feat(templates): inline LaborLinesEditor for row expansion"
```

---

### Task 3: `ComponentTemplateTable` + page wiring (Components tab)

**Goal:** Components tab renders a compact design-system table; clicking a row expands it inline into the line editor (qty on blur, remove line, add via picker, footer with LinkControls / used-by / delete).

**Files:**
- Create: `src/app/app/templates/template-table.tsx`
- Modify: `src/app/app/templates/page.tsx` (components branch only; labor branch unchanged until Task 4)
- Modify: `src/app/app/templates/templates.module.css` (table + expansion classes)

**Acceptance Criteria:**
- [ ] Components tab shows ONE `tableCard`/`table` with columns Template / Items / Used by / Status (no per-template cards)
- [ ] Row click toggles expansion; expanding a row collapses any other; collapse by clicking again; client state only (no URL param)
- [ ] Title row: chevron ▸/▾ + name; Items = line count; Used by = "N BOMs" or "—"; Status = StatusBadge Linked(success)/Not linked(neutral) + warning "Unpublished changes" when dirty
- [ ] Expansion: description (when present), line grid (component link to `/app/components/[id]` + SKU sub-text, qty input committing on blur via `parseQtyInput` + `setTemplateLines`, unit, `RemoveLineButton`), "+ Add components" picker lightbox pre-seeded with current lines, "No template lines yet." when empty, footer with `LinkControls` + used-by text + `DeleteTemplateButton`
- [ ] Qty commit failure shows inline error (`--danger`, `--fs-xs`); row stays expanded
- [ ] `EmptyState` still shown when zero templates; tab bar and "+ New template" header action unchanged
- [ ] `npx tsc --noEmit` → baseline only

**Verify:** `npx tsc --noEmit` → 2 baseline errors only. Then `npm run dev` → open `/app/templates`: expand/collapse rows, edit a qty (blur), remove a line, add components via the picker (pre-seeded), confirm badges/empty state.

**Steps:**

- [ ] **Step 1: Create `src/app/app/templates/template-table.tsx`** (components tab only in this task)

```tsx
"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import StatusBadge from "../_ui/status-badge";
import { parseQtyInput } from "@/lib/bom/qty-input";
import { setTemplateLines } from "./actions";
import type { AffectedBom } from "./affected";
import { LinkControls } from "./link-controls";
import {
  TemplatePickerLightbox,
  RemoveLineButton,
  DeleteTemplateButton,
} from "./template-forms";
import type { ComponentOption } from "@/app/app/products/_components/component-picker";
import styles from "./templates.module.css";

export type ComponentTemplateRowData = {
  id: string;
  name: string;
  description: string | null;
  isLinked: boolean;
  hasUnpublished: boolean;
  lines: {
    id: string;
    componentId: string;
    componentName: string;
    sku: string | null;
    unit: string | null;
    quantity: number;
  }[];
  affected: AffectedBom[];
};

function usedByLabel(affected: AffectedBom[]): string {
  if (affected.length === 0) return "—";
  return `${affected.length} BOM${affected.length === 1 ? "" : "s"}`;
}

function usedByFooter(affected: AffectedBom[]): string {
  if (affected.length === 0) return "Not used yet";
  return `Used by ${affected.length} BOM${affected.length === 1 ? "" : "s"}`;
}

export function ComponentTemplateTable({
  templates,
  components,
}: {
  templates: ComponentTemplateRowData[];
  components: ComponentOption[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Template</th>
            <th>Items</th>
            <th>Used by</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <Fragment key={t.id}>
                <tr
                  className={styles.rowClickable}
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                >
                  <td>
                    <span className={styles.chevron}>{expanded ? "▾" : "▸"}</span>
                    <span className={styles.rowName}>{t.name}</span>
                  </td>
                  <td>{t.lines.length}</td>
                  <td>{usedByLabel(t.affected)}</td>
                  <td>
                    <span className={styles.badgeGroup}>
                      {t.isLinked ? (
                        <StatusBadge variant="success">Linked</StatusBadge>
                      ) : (
                        <StatusBadge>Not linked</StatusBadge>
                      )}
                      {t.hasUnpublished ? (
                        <StatusBadge variant="warning">Unpublished changes</StatusBadge>
                      ) : null}
                    </span>
                  </td>
                </tr>
                {expanded ? (
                  <tr className={styles.expRow}>
                    <td colSpan={4} className={styles.expCell}>
                      <ComponentExpansion template={t} components={components} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComponentExpansion({
  template,
  components,
}: {
  template: ComponentTemplateRowData;
  components: ComponentOption[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function commitQty(lineId: string) {
    const raw = drafts[lineId];
    if (raw === undefined) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    const parsed = parseQtyInput(raw);
    const line = template.lines.find((l) => l.id === lineId);
    if (!line || parsed === null || parsed === line.quantity) return;
    setBusy(true);
    setError(null);
    const result = await setTemplateLines(
      template.id,
      template.lines.map((l) => ({
        component_id: l.componentId,
        quantity: l.id === lineId ? parsed : l.quantity,
      }))
    );
    setBusy(false);
    if (result.error) setError(result.error);
  }

  return (
    <div>
      {template.description ? <p className={styles.expDesc}>{template.description}</p> : null}
      {template.lines.length > 0 ? (
        <div className={styles.expLineGrid}>
          <span className={styles.colHeader}>Component</span>
          <span className={styles.colHeader}>Qty</span>
          <span className={styles.colHeader}>Unit</span>
          <span />
          {template.lines.map((line) => (
            <Fragment key={line.id}>
              <span className={styles.expComponent}>
                <Link href={`/app/components/${line.componentId}`} className={styles.componentLink}>
                  {line.componentName}
                </Link>
                {line.sku ? <span className={styles.expSku}>{line.sku}</span> : null}
              </span>
              <input
                className={styles.qtyInput}
                value={drafts[line.id] ?? String(line.quantity)}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))
                }
                onBlur={() => commitQty(line.id)}
                disabled={busy}
                inputMode="decimal"
                aria-label={`Quantity for ${line.componentName}`}
              />
              <span className={styles.expUnit}>{line.unit ?? "ea"}</span>
              <RemoveLineButton lineId={line.id} templateId={template.id} />
            </Fragment>
          ))}
        </div>
      ) : (
        <p className={styles.expEmpty}>No template lines yet.</p>
      )}
      <div className={styles.expAddRow}>
        <TemplatePickerLightbox
          templateId={template.id}
          templateName={template.name}
          existingLines={template.lines.map((l) => ({
            component_id: l.componentId,
            quantity: l.quantity,
          }))}
          components={components}
        />
      </div>
      {error ? <p className={styles.expError}>{error}</p> : null}
      <div className={styles.expFooter}>
        <LinkControls
          templateType="component"
          templateId={template.id}
          isLinked={template.isLinked}
          hasUnpublished={template.hasUnpublished}
          affectedBoms={template.affected}
        />
        <span className={styles.usedBy}>{usedByFooter(template.affected)}</span>
        <DeleteTemplateButton templateId={template.id} usedByCount={template.affected.length} />
      </div>
    </div>
  );
}
```

Notes:
- The expansion `<tr>` has NO `onClick`, so interacting with inputs/buttons inside it never toggles the accordion.
- `setTemplateLines` revalidates the page on the server, so no `router.refresh()` is needed (same pattern as the existing picker save).
- `usedBy` class already exists in `templates.module.css` — reused for the footer text.

- [ ] **Step 2: Add table/expansion CSS to `templates.module.css`**

Append:

```css
/* Compact template list table */
.tableCard {
  composes: tableCard from "../_ui/table.module.css";
}
.table {
  composes: table from "../_ui/table.module.css";
}
.rowClickable {
  cursor: pointer;
}
.rowName {
  font-weight: 600;
  color: var(--ink-strong);
}
.chevron {
  color: var(--ink-faint);
  font-size: var(--fs-xs);
  display: inline-block;
  width: 14px;
}
.badgeGroup {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

/* Expanded row */
.table tbody tr.expRow:hover td {
  background: var(--bg-card);
}
.table td.expCell {
  padding: 14px 16px 16px 30px;
}
.expDesc {
  margin: 0 0 10px;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}
.expLineGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 90px 70px 36px;
  gap: 6px 12px;
  align-items: center;
  font-size: var(--fs-sm);
}
.expComponent {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.expSku {
  font-size: var(--fs-xs);
  color: var(--ink-faint);
}
.expUnit {
  color: var(--ink-muted);
}
.qtyInput {
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  padding: 5px 8px;
  font-size: var(--fs-sm);
  background: var(--bg-card);
  color: var(--ink-strong);
  width: 100%;
  box-sizing: border-box;
}
.expEmpty {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}
.expFooter {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border-top: 1px solid var(--stroke);
  margin-top: 14px;
  padding-top: 12px;
}
```

(`.expAddRow` and `.expError` were added in Task 2.)

- [ ] **Step 3: Rewire the components branch in `page.tsx`**

In `src/app/app/templates/page.tsx`:

1. Add import:

```tsx
import { ComponentTemplateTable, type ComponentTemplateRowData } from "./template-table";
```

2. Remove now-unused imports from `./template-forms`: keep `CreateTemplateButton`; remove `RemoveLineButton`, `DeleteTemplateButton`, `TemplatePickerLightbox` (they are now consumed by `template-table.tsx`). Remove the `LinkControls` import ONLY after Task 4 (the labor branch still uses it in this task — keep it for now).

3. After the `componentOptions` mapping (around line 167), add the row mapping:

```tsx
const componentRows: ComponentTemplateRowData[] = typedTemplates.map((template) => {
  const lines = linesByTemplate[template.id] ?? [];
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    isLinked: template.is_linked,
    hasUnpublished: hasUnpublishedChanges(template),
    affected: computeAffectedBoms(typedLinkedBoms, "component_template_id", template.id),
    lines: lines.map((line) => {
      const comp = unwrap(line.component);
      return {
        id: line.id,
        componentId: comp?.id ?? "",
        componentName: comp?.name ?? "Unknown",
        sku: comp?.sku ?? null,
        unit: comp?.unit ?? null,
        quantity: line.quantity,
      };
    }),
  };
});
```

4. Replace the entire components-tab branch (the `typedTemplates.length === 0 ? <EmptyState …/> : typedTemplates.map((template) => { … })` block, currently lines 306-400) with:

```tsx
) : typedTemplates.length === 0 ? (
  <EmptyState
    title="No templates yet"
    message="Create a component template to start reusing common material packs."
  />
) : (
  <ComponentTemplateTable templates={componentRows} components={componentOptions} />
)}
```

The labor branch (lines 195-305) stays exactly as it is in this task.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exactly 2 errors, both in `.next/types/validator.ts`.

Manual (`npm run dev`, open `http://localhost:3000/app/templates`):
- Components tab is a single table; rows expand/collapse, one at a time
- Qty edit commits on blur; invalid input (empty/0/abc) reverts; remove line works
- "+ Add components" opens the picker pre-seeded; saving replaces lines
- Link toggle, publish dialog, delete (with in-use confirm) all work from the footer

- [ ] **Step 5: Commit**

```bash
git add src/app/app/templates/template-table.tsx src/app/app/templates/page.tsx src/app/app/templates/templates.module.css
git commit -m "feat(templates): compact table with inline expansion for components tab"
```

---

### Task 4: `LaborTemplateTable` + page wiring (Labor tab) + delete `LaborEditorDialog`

**Goal:** Labor & Routing tab uses the same compact table pattern; the expansion renders the inline `LaborLinesEditor`; the standalone `LaborEditorDialog` is deleted.

**Files:**
- Modify: `src/app/app/templates/template-table.tsx` (add `LaborTemplateTable`)
- Modify: `src/app/app/templates/page.tsx` (labor branch)
- Modify: `src/app/app/templates/labor-template-forms.tsx` (delete `LaborEditorDialog`)

**Acceptance Criteria:**
- [ ] Labor tab shows ONE table with columns Template / Ops / Used by / Status; Template cell appends a Basic/Advanced `StatusBadge`
- [ ] Expansion: description (when present) + `LaborLinesEditor`; footer with `LinkControls`, `ModeSwitch`, used-by text, `DeleteLaborTemplateButton`
- [ ] Mode switch preserves entered values (rows keep advanced fields when hidden in basic)
- [ ] `LaborEditorDialog` deleted; `grep -rn "LaborEditorDialog" src/` → no matches
- [ ] `npx tsc --noEmit` → baseline only

**Verify:** `npx tsc --noEmit` → 2 baseline errors only. `grep -rn "LaborEditorDialog" src/` → no matches. Manual: labor tab expand → edit/add/remove ops → Save operations; switch mode and confirm values preserved.

**Steps:**

- [ ] **Step 1: Add `LaborTemplateTable` to `template-table.tsx`**

Add these imports to the existing import block:

```tsx
import type { LaborTemplateLineInput } from "./actions";
import {
  LaborLinesEditor,
  ModeSwitch,
  DeleteLaborTemplateButton,
  type DepartmentOption,
} from "./labor-template-forms";
```

Append at the end of the file:

```tsx
export type LaborTemplateRowData = {
  id: string;
  name: string;
  description: string | null;
  mode: "basic" | "advanced";
  isLinked: boolean;
  hasUnpublished: boolean;
  lines: LaborTemplateLineInput[];
  affected: AffectedBom[];
};

export function LaborTemplateTable({
  templates,
  departments,
}: {
  templates: LaborTemplateRowData[];
  departments: DepartmentOption[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Template</th>
            <th>Ops</th>
            <th>Used by</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <Fragment key={t.id}>
                <tr
                  className={styles.rowClickable}
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                >
                  <td>
                    <span className={styles.chevron}>{expanded ? "▾" : "▸"}</span>
                    <span className={styles.rowName}>{t.name}</span>{" "}
                    {t.mode === "advanced" ? (
                      <StatusBadge variant="info">Advanced</StatusBadge>
                    ) : (
                      <StatusBadge>Basic</StatusBadge>
                    )}
                  </td>
                  <td>{t.lines.length}</td>
                  <td>{usedByLabel(t.affected)}</td>
                  <td>
                    <span className={styles.badgeGroup}>
                      {t.isLinked ? (
                        <StatusBadge variant="success">Linked</StatusBadge>
                      ) : (
                        <StatusBadge>Not linked</StatusBadge>
                      )}
                      {t.hasUnpublished ? (
                        <StatusBadge variant="warning">Unpublished changes</StatusBadge>
                      ) : null}
                    </span>
                  </td>
                </tr>
                {expanded ? (
                  <tr className={styles.expRow}>
                    <td colSpan={4} className={styles.expCell}>
                      {t.description ? (
                        <p className={styles.expDesc}>{t.description}</p>
                      ) : null}
                      <LaborLinesEditor
                        templateId={t.id}
                        mode={t.mode}
                        existingLines={t.lines}
                        departments={departments}
                      />
                      <div className={styles.expFooter}>
                        <LinkControls
                          templateType="labor"
                          templateId={t.id}
                          isLinked={t.isLinked}
                          hasUnpublished={t.hasUnpublished}
                          affectedBoms={t.affected}
                        />
                        <ModeSwitch templateId={t.id} mode={t.mode} />
                        <span className={styles.usedBy}>{usedByFooter(t.affected)}</span>
                        <DeleteLaborTemplateButton
                          templateId={t.id}
                          usedByCount={t.affected.length}
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Rewire the labor branch in `page.tsx`**

1. Update the `template-table` import:

```tsx
import {
  ComponentTemplateTable,
  LaborTemplateTable,
  type ComponentTemplateRowData,
  type LaborTemplateRowData,
} from "./template-table";
```

2. Trim the `./labor-template-forms` import to:

```tsx
import { CreateLaborTemplateButton, type DepartmentOption } from "./labor-template-forms";
```

3. Remove the now-unused `LinkControls` import and the `LaborTemplateLineInput` type import remains (used in the row mapping below). Also remove the `RemoveLineButton`-style leftovers if any were missed in Task 3.

4. Next to `componentRows`, add:

```tsx
const laborRows: LaborTemplateRowData[] = laborTemplates.map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  mode: t.mode,
  isLinked: t.is_linked,
  hasUnpublished: hasUnpublishedChanges(t),
  affected: computeAffectedBoms(typedLinkedBoms, "labor_template_id", t.id),
  lines: (laborLinesByTemplate[t.id] ?? []).map((line) => ({
    department_id: line.department_id,
    operation_name: line.operation_name,
    sequence: line.sequence,
    setup_hours: line.setup_hours,
    run_hours_per_unit: line.run_hours_per_unit,
    admin_hours_per_unit: line.admin_hours_per_unit,
    electricity_kwh_per_unit: line.electricity_kwh_per_unit,
    gas_units_per_unit: line.gas_units_per_unit,
    notes: line.notes,
  })),
}));
```

5. Replace the entire labor branch (`laborTemplates.length === 0 ? <EmptyState …/> : laborTemplates.map((t) => { … })`) with:

```tsx
{tab === "labor" ? (
  laborTemplates.length === 0 ? (
    <EmptyState
      title="No labor templates yet"
      message="Create a labor template to define reusable routing operations for BOMs."
    />
  ) : (
    <LaborTemplateTable templates={laborRows} departments={departmentOptions} />
  )
) : …existing components branch…}
```

6. The `unwrap` import may now be used only inside `componentRows` mapping — keep it. The `LaborTemplateLine` local type and `laborLinesByTemplate` grouping stay (used by `laborRows`). Delete the old `editorLines` mapping and any other code that only fed the old card rendering.

- [ ] **Step 3: Delete `LaborEditorDialog` from `labor-template-forms.tsx`**

Remove the entire `LaborEditorDialog` function (currently lines 138-365 of the pre-Task-2 file). Keep `newKey()`/`draftCounter` and `LaborLineDraft` (used by `LaborLinesEditor`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exactly 2 errors, both in `.next/types/validator.ts`.

Run: `grep -rn "LaborEditorDialog" src/`
Expected: no matches.

Manual (`/app/templates?tab=labor`): expand a labor template; edit op fields, add/remove ops, Save operations; switch Basic↔Advanced and confirm hidden values survive (enter advanced values, switch to basic, switch back — values intact after re-expanding); link toggle + publish + delete from footer.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/templates/template-table.tsx src/app/app/templates/page.tsx src/app/app/templates/labor-template-forms.tsx
git commit -m "feat(templates): compact table with inline labor editor; remove LaborEditorDialog"
```

---

### Task 5: CSS cleanup + full verification sweep

**Goal:** Remove all big-card CSS that nothing references anymore; run the full verification baseline.

**Files:**
- Modify: `src/app/app/templates/templates.module.css`

**Acceptance Criteria:**
- [ ] Every class listed below is confirmed unreferenced (grep) and deleted; every class still referenced is kept
- [ ] No `--surface-1` blocks remain in template list/expansion styling (allowed to remain only in classes used by the create dialogs and LinkControls publish rows, which are inside-card items per the design system)
- [ ] `npx tsc --noEmit` → baseline; `npx vitest run --pool threads --maxWorkers 1` → only the 2 baseline failures; templates page renders correctly in both tabs

**Verify:** `npx tsc --noEmit` → 2 baseline errors. `npx vitest run --pool threads --maxWorkers 1` → 2 baseline failures only. Manual smoke of both tabs.

**Steps:**

- [ ] **Step 1: Confirm and delete unused classes**

For each candidate class below, run `grep -rn "styles.<name>" src/app/app/templates/` (and `src/` if unsure). Delete the class from `templates.module.css` only when there are zero references:

Expected-dead after Tasks 1-4 (verify each):
`breadcrumb`, `templateCard`, `templateTop`, `templateInfo`, `templateNameRow`, `lineCountBadge`, `templateDesc`, `lineList`, `lineRow`, `lineIdentity`, `lineMeta`, `lineAction`, `emptyLines`, `addLineWrap`, `addLineForm`, `badgeLinked`, `badgeUnlinked`, `badgeDirty`, `badgeMode`, `cardFooter`, `labGrid`, `dialogWide`, `dialogInnerWide`, `dialogSub`, `laborEditor`, `laborEditorRow`.

Watch for grouped selectors — e.g. the rule `.templateDesc, .lineIdentity span, .lineMeta span, .emptyLines { … }` disappears entirely once all four are dead. Also prune dead names from the `@media (max-width: 720px)` block (it currently references `templateTop`, `templateNameRow`, `lineRow`, `addLineForm` — after cleanup only `dialogActions` should remain in it).

Must KEEP (referenced by surviving components — verify, don't assume):
`page`, `addButton`, `btnSmall`, `removeBtn`, `deleteTplBtn`, `dialog`, `dialogInner`, `dialogHeader`, `dialogClose`, `dialogForm`, `field`, `dialogActions`, `btnCancel`, `btnSubmit`, `error`, `componentLink`, `tabBar`, `tab`, `tabActive`, `usedBy`, `linkToggle`, `knob`, `knobOn`, `infoWrap`, `infoIcon`, `tooltip`, `publishBtn`, `inlineForm`, `colHeader`, `publishList`, `publishRow`, `publishIdentity`, `publishMeta`, `versionChip`, `publishWarn`, plus everything added in Tasks 1-3 (`addComponentsBtn`, `tableCard`, `table`, `rowClickable`, `rowName`, `chevron`, `badgeGroup`, `expRow`, `expCell`, `expDesc`, `expLineGrid`, `expComponent`, `expSku`, `expUnit`, `qtyInput`, `expEmpty`, `expAddRow`, `expError`, `expFooter`, `laborInlineEditor`, `labEditGridBasic`, `labEditGridAdvanced`).

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit`
Expected: exactly 2 errors, both in `.next/types/validator.ts`.

Run: `npx vitest run --pool threads --maxWorkers 1`
Expected: only the 2 pre-existing failures (`src/lib/allocation/engine.test.ts`, `src/lib/inventory/invariants.test.ts`).

Manual full checklist (from the spec):
- Expand/collapse in both tabs; one row at a time
- Qty edit on blur (valid commits, invalid reverts); remove line
- Add components via picker — pre-seeded selection, save replaces lines
- Labor inline edit + Save operations in both modes; mode switch preserves values
- Link toggle + publish dialog; delete with in-use warning
- Empty states on both tabs; create dialogs from PageHeader action

- [ ] **Step 3: Commit**

```bash
git add src/app/app/templates/templates.module.css
git commit -m "chore(templates): remove dead big-card CSS after table rework"
```

---

## Self-Review (completed)

- **Spec coverage:** List layout/columns/accordion → Task 3 & 4; components expansion (desc, line grid, qty-on-blur, picker dialog, footer, empty placeholder) → Tasks 1 & 3; labor expansion (inline grid, add-op next-free-sequence, Save operations, footer with ModeSwitch, dialog deleted) → Tasks 2 & 4; files section → matches; error handling (inline `--danger` `--fs-xs`, row stays expanded) → Tasks 2 & 3 (`expError`); testing → per-task verify + Task 5 sweep. No gaps.
- **Placeholder scan:** no TBD/TODO; all code steps contain full code.
- **Type consistency:** `ComponentTemplateRowData`/`LaborTemplateRowData` defined in Task 3/4 and used identically in `page.tsx` mappings; `LaborLinesEditor` props in Task 2 match the Task 4 call site; `TemplatePickerLightbox` props unchanged from the old component, matching both call sites.
