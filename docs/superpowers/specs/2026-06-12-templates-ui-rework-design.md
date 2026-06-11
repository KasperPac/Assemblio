# Templates Page UI Rework: Compact Table + Inline Expansion

**Date:** 2026-06-12
**Status:** Approved

## Problem

The templates page (`/app/templates`) renders every template as a large card
with all lines always visible, using grey row backgrounds and heavy spacing.
This ignores the design-system list-page pattern (`tableCard`/`table`
composition) and makes the page noisy once more than a few templates exist.

## Decisions

- **Compact list:** each tab shows one design-system table; rows are template
  titles plus a few compact columns. Clicking a row expands it inline
  (accordion). One row expanded at a time; client state only, no URL param.
- **Inline editing:** the expanded area is the editor. Component quantities
  edit in place; labor operations edit in an inline grid. No separate edit
  dialogs for lines.
- **Component lookup reuses ComponentPicker:** "+ Add components" in the
  expansion opens the existing `ComponentPicker`
  (`src/app/app/products/_components/component-picker.tsx`) in a lightbox,
  pre-seeded with the template's current lines. Saving replaces the template's
  lines.
- **Server actions unchanged:** this is a pure UI rework. All existing
  actions (`setTemplateLines`, `setLaborTemplateLines`, `removeTemplateLine`,
  `setTemplateLinked`, `publishTemplate`, delete actions) are reused as-is.

## Design

### 1. List layout (both tabs)

- Replace the per-template `.templateCard` sections with a single
  `tableCard`/`table` composed from `_ui/table.module.css` per tab — same as
  the Purchasing and Components list pages.
- Columns:
  | Column | Content |
  |---|---|
  | Template | chevron (▸/▾) + name; labor rows append a Basic/Advanced `StatusBadge` |
  | Items / Ops | line count (components tab: "Items"; labor tab: "Ops") |
  | Used by | "N BOMs" from `computeAffectedBoms`, or "—" when unused |
  | Status | Linked / Not linked badge; amber "Unpublished changes" badge when `hasUnpublishedChanges` |
- Row click toggles expansion. Expanding a row collapses any other.
- `EmptyState` when a tab has zero templates. Tab bar (`?tab=`) and
  "+ New template" PageHeader action are unchanged.
- Surfaces follow the design system strictly: table header `--bg-card-alt`,
  row dividers `--stroke`, card background `--bg-card`. No `--surface-1`
  blocks, no large padding.

### 2. Expanded row — Components tab

Rendered as a full-width row (`<td colSpan>`) under the title row, on the
same `--bg-card` surface with a `--stroke` divider.

- Description paragraph at top when present (`--fs-sm`, `--ink-muted`).
- Line grid (compact, `--fs-sm`): component name as link to
  `/app/components/[id]` with SKU sub-text (`--fs-xs`, `--ink-faint`),
  editable Qty input, unit, ✕ remove per line (existing `RemoveLineButton`).
- Qty editing uses the established draft-buffer pattern: per-row string
  draft + `parseQtyInput` from `src/lib/bom/qty-input.ts`, commit on blur
  only when valid, calling a server action that updates that line's quantity
  (reuses `setTemplateLines` with the full updated line set).
- "+ Add components" button opens the existing `ComponentPicker` in a
  `<dialog>` lightbox, pre-seeded via `initialSelection` with the template's
  current `{component_id: quantity}` map. Save label "Save template".
  On save, the full selection replaces the template's lines via
  `setTemplateLines`.
- Footer row (single flex line, `--fs-sm`): `LinkControls` (dynamic link
  toggle + info tooltip + publish button/dialog — unchanged), "Used by N
  BOMs" text, Delete button (existing `DeleteTemplateButton`).
- "No template lines yet." placeholder when empty.

### 3. Expanded row — Labor & Routing tab

Same expansion pattern; the line area is the inline editor (the row editor
currently inside `LaborEditorDialog`, moved into the expansion):

- Grid columns: sequence (integer input, `step={1}`), operation name,
  department select, and — advanced mode only — setup hours, run hours/unit,
  admin hours/unit, electricity kWh/unit, gas units/unit, notes. Basic mode
  hides the advanced columns but preserves their values in row state.
- "+ Add operation" appends a row (next free sequence). ✕ removes a row.
- Explicit "Save operations" button commits all rows via the existing
  `setLaborTemplateLines` (same client-side validation: positive integer
  sequences, no duplicates, non-negative hours). Inline error text on
  failure.
- Footer row: `LinkControls`, mode switch (existing `ModeSwitch`), "Used by
  N BOMs", Delete (existing `DeleteLaborTemplateButton`).
- The standalone `LaborEditorDialog` component is deleted.

### 4. Files

- Rework: `src/app/app/templates/page.tsx` (server component slims to data
  fetch + table shell), `src/app/app/templates/templates.module.css`
  (table composition + expansion grid; big-card classes removed).
- New: `src/app/app/templates/template-table.tsx` — client component
  rendering rows + expansion state for both tabs (or two thin wrappers
  around a shared table if cleaner at implementation time).
- Rework: `src/app/app/templates/template-forms.tsx` — `TemplateLightbox`
  replaced by a picker-lightbox component that wraps `ComponentPicker`;
  create/delete buttons kept.
- Rework: `src/app/app/templates/labor-template-forms.tsx` —
  `LaborEditorDialog` becomes an inline `LaborLinesEditor`; create/delete/
  mode-switch kept.
- Unchanged: `actions.ts`, `affected.ts`, `link-controls.tsx`, all server
  logic.

### 5. Error handling

- Qty commit failures and labor save failures show inline error text in the
  expansion (red `--danger`, `--fs-xs`); the row stays expanded.
- ComponentPicker save errors surface through its existing `onSave` error
  return.
- Publish/link/delete error behavior is unchanged (owned by `LinkControls`
  and the delete buttons).

## Testing

- `npx tsc --noEmit` against baseline (2 errors in `.next/types/validator.ts`).
- Existing vitest suites unaffected (`publish.test.ts`, `affected.test.ts`);
  run full suite against baseline.
- Manual: expand/collapse both tabs, qty edit on blur, remove line, add
  components via picker (pre-seeded selection), labor inline edit + save in
  both modes, mode switch preserves values, link toggle + publish dialog,
  delete with in-use warning, empty states.
