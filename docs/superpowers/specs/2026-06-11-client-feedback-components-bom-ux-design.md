# Client Feedback Fixes: Components & BOM UX

Date: 2026-06-11
Status: Approved

Six UX issues reported by the first client, all contained UI fixes. DB schema
already supports everything needed (`component.description` exists,
`product_bom_component.quantity` is `numeric`).

## 1. Description in components table

- `src/app/app/components/page.tsx`: add `description` to the component select.
- `src/app/app/components/component-table.tsx`: add `description: string | null`
  to the row type; render as a muted, single-line truncated sub-line under the
  component name (no new column).
- Include description in the client-side search match (`q`).

## 2. Preserve search criteria after visiting a component detail page

- Carry the list's query params (`q`, `filter`, `sort`, `dir`) onto the detail
  link: `/app/components/{id}?q=…&filter=…&sort=…&dir=…`.
- The detail page's "← Back" link rebuilds `/app/components?{same params}`.
- Rejected alternative: `router.back()` — breaks when arriving from a BOM line
  link (could leave the app).

## 3. Description in BOM add-component picker

- Variant page query (`src/app/app/products/variants/[variantId]/page.tsx`)
  adds `description` to the component select.
- `ComponentOption` type (bom-lightbox.tsx, bom-editor.tsx) gains
  `description: string | null`.
- Picker rows render description as a muted truncated line under the name.
- Picker search also matches against description.

## 4 + 5. Qty input fixes (bom-lightbox picker AND bom-editor table)

Root cause in both places: controlled `type="number"` inputs re-parse/clamp on
every keystroke, so an empty field parses to 0, which either deselects the
component (lightbox `setQty(0)` deletes the selection) or clamps to 1
(editor `Math.max(1, …)`), making `0.5` impossible to type.

Fix pattern — per-row local string buffer:

- Input: `type="number" step="any" inputMode="decimal"`, backed by local
  **string** state. Typing never clamps and never deselects.
- On blur: parse the string. Valid and > 0 → commit (update selection in
  lightbox; save to server via existing action in bom-editor). Empty, invalid,
  or ≤ 0 → revert to last good value.
- Deselection happens ONLY via the checkbox or ✕ remove button.
- −/+ buttons step by 1; minus never drops the value to ≤ 0 (no-op at or
  below 1) and never removes the selection.
- bom-editor drops `min={1}` and the `Math.max(1, …)` clamp; blur-save commits
  exactly the parsed field value. Decimals supported end-to-end.

## 6. Wider qty field in add-component modal

- `bom-lightbox.module.css`: widen `.stepperQty` (~64px) and bump font size so
  values like `0.5` are legible.

## Testing

Manual verification per issue: type `0.5` in both qty inputs, backspace
mid-edit, search → open detail → back retains criteria, descriptions visible
in table and picker.
