# Products High-Priority Fixes — Design Spec
> 2026-06-01 · Fixes A3, A4, B2, B3, C1, C2 from `docs/review/product/products-review.md`

---

## Scope

Six 🟠 High-priority findings from the pre-launch products review:

| ID | Finding | Category |
|----|---------|----------|
| A3 | Routing tab shows editable forms for all BOM versions including archived | Bug |
| A4 | "Import Products" button has no feedback | Bug |
| B2 | Filter `<select>` never submits without pressing Enter | Accessibility |
| B3 | Variant coverage table rows are mouse-only | Accessibility |
| C1 | "Save BOM" activates live version with no warning | Ease of Use |
| C2 | Discard / Delete draft have no confirmation | Ease of Use |

---

## A3 — Routing tab: archived BOMs read-only/collapsible

### Problem
`src/app/app/products/variants/[variantId]/page.tsx` renders every BOM version in the routing tab with live Save/Remove buttons. Archived versions (status `"archived"`) are indistinguishable from the active/draft BOM in edit mode. A user can destructively modify operations on a BOM version that is no longer live.

### Solution

Split `typedBoms` (type `BomRecord[]`, fields: `id`, `version`, `status`, `is_active`, `created_at`) into two groups:

```typescript
const editableBoms = typedBoms.filter((b) => b.status !== "archived");
const archivedBoms = typedBoms.filter((b) => b.status === "archived");
```

- Render `editableBoms` with the existing form UI unchanged.
- After `editableBoms`, if `archivedBoms.length > 0`, render a native HTML `<details>` / `<summary>` block:
  - Summary label: `Show historical routing ({archivedBoms.length} version{s})`
  - Body: `archivedBoms.map(bom => ...)` — each archived BOM shows its labor lines as read-only text rows (operation name, hours, utilities). No `<form>`, no Save, no Remove buttons.

No new client component is needed — `<details>` / `<summary>` is pure HTML and works without JavaScript.

---

## A4 — Import Products button: redirect + banner

### Problem
`<form method="post" action="/api/shopify/sync">` submits with no loading state, no success message, and no error display. The sync route already supports a `returnTo` parameter and redirects to `{returnTo}?shopify=sync-ok&products={N}&orders={N}` on success, or `{returnTo}?shopify=sync-failed&sync_error={msg}` on failure — but the form never passes `returnTo`.

### Solution

**Form change** (`src/app/app/products/page.tsx`):
Add a hidden input to the Import Products form:
```tsx
<input type="hidden" name="returnTo" value="/app/products" />
```

**Banner** (`src/app/app/products/page.tsx`):
The page receives `searchParams` as a Next.js server component prop. Read `searchParams.shopify`:
- `"sync-ok"`: render a green info banner above the table — *"Synced {searchParams.products} products and {searchParams.orders} orders."*
- `"sync-failed"`: render a red error banner — *"Sync failed: {searchParams.sync_error}"*
- Otherwise: render nothing.

The banner sits between the `<PageHeader>` and the filter/table section. Use existing design token classes (`--feedback-positive`, `--feedback-danger`, or equivalent from the Manuva design system).

---

## B2 — Filter select: auto-submit on change

### Problem
`products/page.tsx` is a server component. The filter form contains a `<select name="filter">` with no submit button. Changing the dropdown produces no response because `onChange` cannot be added in a server component.

### Solution

Extract a new `"use client"` component: `src/app/app/products/product-filters.tsx`

**Props:**
```typescript
type Props = {
  defaultQ?: string;
  defaultFilter: string;
};
```

**Renders** the existing filter `<form method="get">` with:
- The search `<input>` unchanged (Enter submits already)
- The `<select>` with `onChange={(e) => e.currentTarget.form?.requestSubmit()}`

**In `products/page.tsx`:** replace the inline `<form className={styles.filters}>` block with `<ProductFilters defaultQ={params.q} defaultFilter={filter} />`. The CSS class `styles.filters` moves to the form inside `ProductFilters`.

---

## B3 — Variant coverage table rows: keyboard navigation

### Problem
`src/app/app/products/[productId]/variant-coverage-table.tsx` is already a client component. Each `<tr>` has `onClick={() => router.push(...)}` but no keyboard support — no `tabIndex`, `role`, or `onKeyDown`.

### Solution

Add to each `<tr>`:
```tsx
tabIndex={0}
role="link"
onKeyDown={(e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    router.push(`/app/products/variants/${v.id}`);
  }
}}
```

This matches the pattern already used in `bom-versions-tab.tsx` (lines 535–539 per the review). No other changes required.

---

## C1 — "Save BOM" → "Activate BOM" with confirmation

### Problem
`src/app/app/products/bom-editor.tsx` renders `<button type="submit">Save BOM</button>` inside a `<form action={setBomActive}>`. Submitting immediately replaces the live BOM with no warning. The label also misrepresents what the action does.

### Solution

`bom-editor.tsx` is already a client component. Add:

```typescript
const saveBomDialogRef = useRef<HTMLDialogElement>(null);
const saveBomFormRef = useRef<HTMLFormElement>(null);
```

**Form:** add `ref={saveBomFormRef}` to the `<form action={setBomActive}>`.

**Button:** change `type="submit"` → `type="button"`, label "Save BOM" → "Activate BOM", `onClick={() => saveBomDialogRef.current?.showModal()}`.

**Dialog:**
```tsx
<dialog ref={saveBomDialogRef}>
  <p>Activate this BOM? This will replace the current live version and cannot be undone.</p>
  <div>
    <button type="button" onClick={() => saveBomDialogRef.current?.close()}>Cancel</button>
    <button
      type="button"
      onClick={() => {
        saveBomDialogRef.current?.close();
        saveBomFormRef.current?.requestSubmit();
      }}
    >
      Activate BOM
    </button>
  </div>
</dialog>
```

The dialog is placed inside the component's JSX (not inside the form). Styling follows the existing `<dialog>` pattern from `bom-lightbox.tsx` / `template-wizard.tsx`.

---

## C2 — Discard / Delete draft confirmation

### Problem
Both "Discard" and "Delete draft" in `bom-editor.tsx` immediately and permanently delete the draft BOM with no confirmation.

### Solution

Both actions call the same server action (`deleteBomDraft`) with the same hidden inputs. They share one dialog and one form ref.

Add:
```typescript
const discardDialogRef = useRef<HTMLDialogElement>(null);
const discardFormRef = useRef<HTMLFormElement>(null);
```

**Discard form:** add `ref={discardFormRef}`. Change the submit button to `type="button"` with `onClick={() => discardDialogRef.current?.showModal()}`.

**Delete draft menu item:** change to `type="button"` with `onClick={() => { setMenuOpen(false); discardDialogRef.current?.showModal(); }}`.

**Dialog:**
```tsx
<dialog ref={discardDialogRef}>
  <p>Delete this draft? This cannot be undone.</p>
  <div>
    <button type="button" onClick={() => discardDialogRef.current?.close()}>Cancel</button>
    <button
      type="button"
      className={styles.btnDanger}
      onClick={() => {
        discardDialogRef.current?.close();
        discardFormRef.current?.requestSubmit();
      }}
    >
      Delete
    </button>
  </div>
</dialog>
```

---

## Files changed

| File | Action | Covers |
|------|--------|--------|
| `src/app/app/products/variants/[variantId]/page.tsx` | Modify | A3 |
| `src/app/app/products/page.tsx` | Modify | A4, B2 (import ProductFilters) |
| `src/app/app/products/product-filters.tsx` | Create | B2 |
| `src/app/app/products/[productId]/variant-coverage-table.tsx` | Modify | B3 |
| `src/app/app/products/bom-editor.tsx` | Modify | C1, C2 |

---

## Out of scope

- D1 (Export BOM to CSV) — feature addition, separate work item
- Medium/Low priority items (A5, B4–B6, C3–C6) — separate work item
- Styling of dialog elements beyond functional correctness — follow existing `bom-lightbox.tsx` dialog pattern
