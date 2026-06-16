# Templates Expansion: BOM-Editor Style

Restyle the expanded template rows on the templates list page to match the variant BOM editor UI. Keep the inline expansion pattern (no separate detail pages).

## Scope

**Component templates only.** Labor templates keep their existing inline editor — it's already a different UI pattern and not comparable to the BOM component table.

## Current State

Expanded component template rows use a CSS grid with 4 columns:
- Component name (with SKU sub-line)
- Qty (plain text input, commit on blur)
- Unit
- Remove button (✕)

No cost information, no drag-and-drop reordering, no stepper pattern.

## Target State

Replace the expansion grid with a proper `<table>` matching the BOM editor (`bom-editor.tsx`):

### Columns

| # | Column | Source | Notes |
|---|--------|--------|-------|
| 1 | Drag handle | — | Grip icon `⠿`, enables reorder via `@dnd-kit` |
| 2 | Component | `line.componentName` | Link to `/app/components/{id}`, "no cost" badge if cost is null |
| 3 | SKU | `line.sku` | Muted text, show "—" if null |
| 4 | Unit | `line.unit` | Muted text, default "ea" |
| 5 | Qty | `line.quantity` | Stepper pattern: − [input] + (same as BOM editor) |
| 6 | Unit cost | component `cost_per_unit` | Muted, formatted `$X.XX` or "—" |
| 7 | Line cost | qty × unit cost | Bold, formatted `$X.XX` or "—" |
| 8 | Remove | — | ✕ button |

### Mini toolbar

Above the table, a small toolbar row with:
- Left: component count label ("4 components")
- Right: "+ Add component" button (opens existing `TemplatePickerLightbox`)

### Materials total

Below the table, a right-aligned summary row:
- "MATERIALS TOTAL" label (caps, muted) + bold total value

### Footer

Unchanged — link controls, "Used by X BOMs", delete button.

## Data Requirements

The `ComponentTemplateRowData.lines` type already has `componentId`, `componentName`, `sku`, `unit`, `quantity`. Need to add `cost_per_unit: number | null` to each line so we can show unit cost and compute line cost.

This means the server query in `templates/page.tsx` must join `component.cost_per_unit` when fetching template lines.

## Drag-and-Drop

Use `@dnd-kit` (already a project dependency) with the same `SortableContext` + `verticalListSortingStrategy` pattern as `bom-editor.tsx`. On drag end, call a new server action `reorderTemplateLines(templateId, lineIds[])` that updates `sort_order` on `component_template_line`.

The `component_template_line` table needs a `sort_order` column if it doesn't already have one. Check schema; if missing, create a SQL patch.

## Qty Stepper

Replace the plain `<input>` with the BOM editor's stepper pattern:
- `−` button (decrement, floor at 1)
- Center-aligned number input (draft buffer + `parseQtyInput` on blur)
- `+` button (increment)

Reuse the same `stepper` / `stepperInput` CSS classes from `bom-editor.module.css` (compose or duplicate into `templates.module.css`).

## Files to Modify

- `src/app/app/templates/template-table.tsx` — rewrite `ComponentExpansion` to use table + dnd-kit + stepper
- `src/app/app/templates/templates.module.css` — add toolbar, stepper, drag handle, materials total styles
- `src/app/app/templates/page.tsx` — join `cost_per_unit` in template lines query
- `src/app/app/templates/actions.ts` — add `reorderTemplateLines` server action

## Out of Scope

- Labor template expansion styling (stays as-is)
- Template detail pages
- Yield % column (templates don't have yield)
- Cost rollup beyond materials total (no sell price / margin on templates)
