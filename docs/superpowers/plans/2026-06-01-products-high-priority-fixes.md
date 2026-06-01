# Products High-Priority Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six 🟠 High-priority findings (A3, A4, B2, B3, C1, C2) from the products pre-launch review.

**Architecture:** All changes are within the existing products feature — one new client component (ProductFilters), CSS additions, and JSX edits. No new server actions, no new routes, no DB changes required.

**Tech Stack:** Next.js 15 App Router, CSS Modules, TypeScript, native HTML5 `<dialog>` + `<details>/<summary>`

---

## File Map

| File | Action | Covers |
|------|--------|--------|
| `src/app/app/products/variants/[variantId]/page.tsx` | Modify (lines 607–895) | A3 |
| `src/app/app/products/variant-detail.module.css` | Modify — add CSS classes | A3 |
| `src/app/app/products/page.tsx` | Modify (lines 293–313) | A4, B2 import |
| `src/app/app/products/product-filters.tsx` | **Create** | B2 |
| `src/app/app/products/[productId]/variant-coverage-table.tsx` | Modify (lines 84–89) | B3 |
| `src/app/app/products/bom-editor.tsx` | Modify (lines 1–3, 227–262) | C1, C2 |
| `src/app/app/products/bom-editor.module.css` | Modify — add CSS classes | C1, C2 |

---

## Task 1 — A3: Archived BOMs read-only in routing tab

**Files:**
- Modify: `src/app/app/products/variants/[variantId]/page.tsx:607–896`
- Modify: `src/app/app/products/variant-detail.module.css`

### Background

`[variantId]/page.tsx` at line 613 maps over `typedBoms` (type `BomRecord[]`, fields: `id`, `version`, `status`, `is_active`, `created_at`), rendering editable forms for every BOM including archived. All archived BOMs need to become read-only text rows inside a collapsible `<details>/<summary>` block.

### Steps

- [ ] **Step 1: Add CSS classes to `variant-detail.module.css`**

Append to the end of `src/app/app/products/variant-detail.module.css`:

```css
/* ── Archived BOM history ───────────────────────────── */

.archivedSection {
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.archivedSummary {
  padding: 10px 14px;
  font-size: 13px;
  color: var(--ink-muted);
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.archivedSummary::-webkit-details-marker { display: none; }

.archivedBomBlock {
  border-top: 1px solid var(--stroke);
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}

.archivedBomLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-muted);
}

.archivedRow {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px 16px;
  font-size: 13px;
  color: var(--ink-secondary);
  padding: 4px 0;
  border-bottom: 1px solid var(--stroke-faint, var(--stroke));
}

.archivedRow:last-child { border-bottom: none; }

.archivedRowEmpty {
  font-size: 13px;
  color: var(--ink-faint);
  font-style: italic;
}
```

- [ ] **Step 2: Split typedBoms in `[variantId]/page.tsx`**

Find the block at line 607 that starts `routing={`. The `typedBoms.map` starts at line 613. Add two constants just above that map call, inside the `routing={` JSX expression.

Replace (starting at line 612, the blank line before `typedBoms.map`):

```tsx
                ) : (
                  typedBoms.map((bom) => {
```

with:

```tsx
                ) : (
                  <>
                  {(() => {
                    const editableBoms = typedBoms.filter((b) => b.status !== "archived");
                    const archivedBoms = typedBoms.filter((b) => b.status === "archived");
                    return (
                      <>
                        {editableBoms.map((bom) => {
```

- [ ] **Step 3: Close the editableBoms.map and add the archived section**

The existing `typedBoms.map` closes at line 894–895:
```tsx
                  })
                )}
```

Replace those two lines (and the closing `</div>` of `bomList` two lines later is on line 896) with the new closing + archived section. The full replacement is:

Replace this exact block (lines 893–895 in the current file):

```tsx
                  })
                )}
              </div>
```

with:

```tsx
                        })}
                        {archivedBoms.length > 0 && (
                          <details className={styles.archivedSection}>
                            <summary className={styles.archivedSummary}>
                              Show historical routing ({archivedBoms.length} version{archivedBoms.length === 1 ? "" : "s"})
                            </summary>
                            {archivedBoms.map((bom) => {
                              const laborRows = laborLinesByBom[bom.id] ?? [];
                              return (
                                <div key={bom.id} className={styles.archivedBomBlock}>
                                  <div className={styles.archivedBomLabel}>
                                    Version {bom.version} · archived{" "}
                                    {new Date(bom.created_at).toLocaleDateString("en-AU", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </div>
                                  {laborRows.length === 0 ? (
                                    <span className={styles.archivedRowEmpty}>No labor operations.</span>
                                  ) : (
                                    laborRows.map((line) => {
                                      const dept = Array.isArray(line.department)
                                        ? line.department[0] ?? null
                                        : line.department;
                                      return (
                                        <div key={line.id} className={styles.archivedRow}>
                                          <span>{line.sequence}. {line.operation_name}{dept?.name ? ` · ${dept.name}` : ""}</span>
                                          <span>{line.run_hours_per_unit}h run</span>
                                          <span>{(line.electricity_kwh_per_unit > 0 || line.gas_units_per_unit > 0)
                                            ? `${line.electricity_kwh_per_unit}kWh · ${line.gas_units_per_unit} gas`
                                            : "no utilities"}</span>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              );
                            })}
                          </details>
                        )}
                      </>
                    );
                  })()}
                  </>
                )}
              </div>
```

- [ ] **Step 4: Verify the file compiles**

```powershell
npx tsc --noEmit 2>&1 | Select-String "variantId"
```

Expected: no errors on that file.

- [ ] **Step 5: Manual test**

Navigate to a variant that has archived BOMs (use a product with multiple BOM versions where at least one is archived). Confirm:
- Active/draft BOMs show with editable forms as before.
- A "Show historical routing (N version/s)" toggle appears at the bottom.
- Expanding it shows read-only rows with operation names and hours.
- No Save/Remove buttons appear in the archived section.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/products/variants/[variantId]/page.tsx src/app/app/products/variant-detail.module.css
git commit -m "fix(products): archived BOMs read-only in routing tab (A3)"
```

---

## Task 2 — A4: Import Products redirect + banner

**Files:**
- Modify: `src/app/app/products/page.tsx:289–299, 287–288`

### Background

The sync route (`src/app/api/shopify/sync/route.ts`) reads `return_to` from the URL query string (`request.nextUrl.searchParams.get("return_to")`), NOT from the form body. On success it redirects to `${returnTo}?shopify=sync-ok&products=${N}&orders=${N}`; on failure to `${returnTo}?shopify=sync-failed&sync_error=${msg}`.

The products page is a server component that receives `searchParams` as a prop.

### Steps

- [ ] **Step 1: Update Import Products form action**

In `src/app/app/products/page.tsx` at line 293, change the form action:

Replace:
```tsx
          <form method="post" action="/api/shopify/sync">
```

with:
```tsx
          <form method="post" action="/api/shopify/sync?return_to=/app/products">
```

- [ ] **Step 2: Read searchParams prop and add banner**

The function signature at the top of `products/page.tsx` is:
```tsx
export default async function ProductsPage({ searchParams }: Props)
```
where `Props` already exists (check if it needs `searchParams`). Find the existing `params = (await searchParams) ?? {}` line and check it resolves `shopify`, `products`, `orders`, and `sync_error` fields.

If `Props` doesn't already have `searchParams`, find the Props type definition near the top of the file and confirm the `searchParams` field. The pattern is standard Next.js:

```tsx
type Props = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    shopify?: string;
    products?: string;
    orders?: string;
    sync_error?: string;
  }>;
};
```

Update/confirm the existing Props type has these fields.

- [ ] **Step 3: Extract sync status and render banner**

After `params = (await searchParams) ?? {}`, the `filter` and `q` vars are extracted. Add:

```tsx
  const syncStatus = params.shopify ?? null;
  const syncProducts = params.products ?? "0";
  const syncOrders = params.orders ?? "0";
  const syncError = params.sync_error ?? "";
```

Then in the JSX, between `<PageHeader ... />` (ends at line ~299) and `<form className={styles.filters}` (line ~301), insert the banner:

```tsx
      {syncStatus === "sync-ok" && (
        <div className={styles.syncBanner} role="status">
          Synced {syncProducts} products and {syncOrders} orders.
        </div>
      )}
      {syncStatus === "sync-failed" && (
        <div className={styles.syncBannerError} role="alert">
          Sync failed: {syncError}
        </div>
      )}
```

- [ ] **Step 4: Add banner CSS to `products.module.css`**

Open `src/app/app/products/products.module.css` and append:

```css
/* ── Sync result banner ────────────────────────────── */

.syncBanner {
  padding: 10px 16px;
  background: var(--ok-dim);
  color: var(--ok);
  border: 1px solid var(--ok-dim);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.syncBannerError {
  padding: 10px 16px;
  background: var(--danger-dim);
  color: var(--danger);
  border: 1px solid var(--danger-dim);
  border-radius: var(--radius-md);
  font-size: 13px;
}
```

- [ ] **Step 5: Verify**

```powershell
npx tsc --noEmit 2>&1 | Select-String "products/page"
```

Expected: no errors.

- [ ] **Step 6: Manual test**

In a browser, navigate to `/app/products?shopify=sync-ok&products=42&orders=17` — confirm a green banner appears. Then test `/app/products?shopify=sync-failed&sync_error=timeout` — confirm a red banner appears. Then navigate to `/app/products` — confirm no banner appears.

- [ ] **Step 7: Commit**

```bash
git add src/app/app/products/page.tsx src/app/app/products/products.module.css
git commit -m "fix(products): import products form redirect + success/error banner (A4)"
```

---

## Task 3 — B2: Filter select auto-submit

**Files:**
- Create: `src/app/app/products/product-filters.tsx`
- Modify: `src/app/app/products/page.tsx` (replace inline `<form className={styles.filters}>` with `<ProductFilters>`)

### Background

`products/page.tsx` is a server component so `onChange` can't be used inline. The fix is a new `"use client"` component that owns the filter form and submits on select change. The CSS class `styles.filters` from `products.module.css` moves into the client component.

### Steps

- [ ] **Step 1: Create `product-filters.tsx`**

Create `src/app/app/products/product-filters.tsx`:

```tsx
"use client";

import styles from "./products.module.css";

type Props = {
  defaultQ?: string;
  defaultFilter: string;
};

export default function ProductFilters({ defaultQ, defaultFilter }: Props) {
  return (
    <form className={styles.filters} method="get">
      <input
        name="q"
        defaultValue={defaultQ ?? ""}
        placeholder="Search by name or SKU"
        aria-label="Search by name or SKU"
      />
      <select
        name="filter"
        defaultValue={defaultFilter}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="all">All</option>
        <option value="with-variants">With variants</option>
        <option value="without-variants">Without variants</option>
      </select>
    </form>
  );
}
```

- [ ] **Step 2: Replace inline form in `products/page.tsx`**

Add import at the top of `src/app/app/products/page.tsx` (after the existing imports):

```tsx
import ProductFilters from "./product-filters";
```

Then find and replace the inline filter form (lines 301–313):

Replace:
```tsx
      <form className={styles.filters} method="get">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by name or SKU"
          aria-label="Search by name or SKU"
        />
        <select name="filter" defaultValue={filter}>
          <option value="all">All</option>
          <option value="with-variants">With variants</option>
          <option value="without-variants">Without variants</option>
        </select>
      </form>
```

with:
```tsx
      <ProductFilters defaultQ={params.q} defaultFilter={filter} />
```

- [ ] **Step 3: Verify**

```powershell
npx tsc --noEmit 2>&1 | Select-String "product-filters|products/page"
```

Expected: no errors.

- [ ] **Step 4: Manual test**

Navigate to `/app/products`. Change the filter dropdown — the page should reload immediately showing filtered results without pressing Enter. The search input should still require Enter to submit.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/products/product-filters.tsx src/app/app/products/page.tsx
git commit -m "fix(products): filter select auto-submits on change via client component (B2)"
```

---

## Task 4 — B3: Variant coverage table keyboard navigation

**Files:**
- Modify: `src/app/app/products/[productId]/variant-coverage-table.tsx:84–89`

### Background

The `<tr>` at line 84 has `onClick` but no keyboard support. Adding `tabIndex`, `role`, and `onKeyDown` makes rows accessible to keyboard users.

### Steps

- [ ] **Step 1: Add keyboard attrs to `<tr>`**

In `src/app/app/products/[productId]/variant-coverage-table.tsx`, find lines 84–89:

```tsx
              <tr
                key={v.id}
                className={noBom ? styles.rowNoBom : styles.row}
                onClick={() => router.push(`/app/products/variants/${v.id}`)}
                style={{ cursor: "pointer" }}
              >
```

Replace with:

```tsx
              <tr
                key={v.id}
                className={noBom ? styles.rowNoBom : styles.row}
                onClick={() => router.push(`/app/products/variants/${v.id}`)}
                style={{ cursor: "pointer" }}
                tabIndex={0}
                role="link"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/app/products/variants/${v.id}`);
                  }
                }}
              >
```

- [ ] **Step 2: Verify**

```powershell
npx tsc --noEmit 2>&1 | Select-String "variant-coverage"
```

Expected: no errors.

- [ ] **Step 3: Manual test**

Navigate to a product detail page with variants. Tab through the coverage table rows — each row should receive focus and be navigable with Enter/Space.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/products/[productId]/variant-coverage-table.tsx
git commit -m "fix(products): variant coverage table rows keyboard navigable (B3)"
```

---

## Task 5 — C1: "Activate BOM" confirmation dialog

**Files:**
- Modify: `src/app/app/products/bom-editor.tsx`
- Modify: `src/app/app/products/bom-editor.module.css`

### Background

`bom-editor.tsx` currently has (lines 234–239):

```tsx
              <form action={setBomActive}>
                <input type="hidden" name="bom_id" value={bom.id} />
                <button type="submit" className={styles.btnPrimary}>
                  Save BOM
                </button>
              </form>
```

This immediately activates the BOM with no warning. The fix: intercept with a `<dialog>` confirmation before submitting the form.

`bom-editor.tsx` already imports `useRef` at line 3: `import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";`

### Steps

- [ ] **Step 1: Add dialog CSS to `bom-editor.module.css`**

Append to `src/app/app/products/bom-editor.module.css`:

```css
/* ── Confirmation dialogs ──────────────────────────── */

.confirmDialog {
  border: none;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--ink-strong);
  box-shadow: var(--shadow-lg);
  padding: 24px;
  max-width: 400px;
  width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.confirmDialog::backdrop {
  background: var(--bg-overlay);
}

.confirmActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btnDanger {
  background: var(--danger);
  border: 1px solid var(--danger);
  color: #fff;
  border-radius: 5px;
  padding: 5px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}

.btnDanger:hover {
  opacity: 0.85;
}
```

- [ ] **Step 2: Add refs and wire up Activate BOM button**

In `bom-editor.tsx`, find the component function body (after the `const` block with `menuRef`, etc.) and add two new refs. Look for the existing `const menuRef = useRef...` line and add the new refs right after it:

```tsx
  const saveBomDialogRef = useRef<HTMLDialogElement>(null);
  const saveBomFormRef = useRef<HTMLFormElement>(null);
```

- [ ] **Step 3: Add ref to the Save BOM form and change button**

Find lines 234–239 in `bom-editor.tsx`:

```tsx
              <form action={setBomActive}>
                <input type="hidden" name="bom_id" value={bom.id} />
                <button type="submit" className={styles.btnPrimary}>
                  Save BOM
                </button>
              </form>
```

Replace with:

```tsx
              <form action={setBomActive} ref={saveBomFormRef}>
                <input type="hidden" name="bom_id" value={bom.id} />
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => saveBomDialogRef.current?.showModal()}
                >
                  Activate BOM
                </button>
              </form>
```

- [ ] **Step 4: Add the confirmation dialog JSX**

The dialog must be placed inside the component's return JSX but **outside** the forms — after the closing `</>` of the toolbar `isDraft` block works well. Find the end of the `isDraft` ternary (around line 279) and place the dialog after it, as a sibling inside the component's outermost div.

Locate the end of the BomEditor component's JSX — there will be a closing `</div>` for the outer wrapper. Place the dialog before that closing tag:

```tsx
      <dialog ref={saveBomDialogRef} className={styles.confirmDialog}>
        <p>Activate this BOM? This will replace the current live version and cannot be undone.</p>
        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.btnDiscard}
            onClick={() => saveBomDialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
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

- [ ] **Step 5: Verify**

```powershell
npx tsc --noEmit 2>&1 | Select-String "bom-editor"
```

Expected: no errors.

- [ ] **Step 6: Manual test**

Navigate to a variant with a draft BOM. Click "Activate BOM" — a dialog should appear with the warning. Click Cancel — dialog closes, BOM remains draft. Click Activate BOM again, then confirm — the BOM activates as before.

- [ ] **Step 7: Commit**

```bash
git add src/app/app/products/bom-editor.tsx src/app/app/products/bom-editor.module.css
git commit -m "fix(products): Activate BOM requires confirmation dialog (C1)"
```

---

## Task 6 — C2: Discard / Delete draft confirmation

**Files:**
- Modify: `src/app/app/products/bom-editor.tsx`
- Modify: `src/app/app/products/bom-editor.module.css` (already modified in Task 5)

### Background

Both Discard (lines 227–233) and Delete draft (lines 253–259) call `deleteBomDraft` immediately. They share the same hidden inputs and should share one dialog and one form ref.

Current code (lines 227–233):
```tsx
              <form action={deleteBomDraft}>
                <input type="hidden" name="bom_id" value={bom.id} />
                <input type="hidden" name="variant_id" value={variantId} />
                <button type="submit" className={styles.btnDiscard}>
                  Discard
                </button>
              </form>
```

Current code (lines 253–259):
```tsx
                    <form action={deleteBomDraft} onSubmit={() => setMenuOpen(false)}>
                      <input type="hidden" name="bom_id" value={bom.id} />
                      <input type="hidden" name="variant_id" value={variantId} />
                      <button type="submit" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem">
                        Delete draft
                      </button>
                    </form>
```

### Steps

- [ ] **Step 1: Add discard dialog refs (alongside Task 5 refs)**

If Task 5 was done first, add these immediately after the `saveBomFormRef` line:

```tsx
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const discardFormRef = useRef<HTMLFormElement>(null);
```

- [ ] **Step 2: Wire up Discard form and button**

Replace lines 227–233:

```tsx
              <form action={deleteBomDraft}>
                <input type="hidden" name="bom_id" value={bom.id} />
                <input type="hidden" name="variant_id" value={variantId} />
                <button type="submit" className={styles.btnDiscard}>
                  Discard
                </button>
              </form>
```

with:

```tsx
              <form action={deleteBomDraft} ref={discardFormRef}>
                <input type="hidden" name="bom_id" value={bom.id} />
                <input type="hidden" name="variant_id" value={variantId} />
                <button
                  type="button"
                  className={styles.btnDiscard}
                  onClick={() => discardDialogRef.current?.showModal()}
                >
                  Discard
                </button>
              </form>
```

- [ ] **Step 3: Wire up Delete draft menu item**

Replace lines 253–259:

```tsx
                    <form action={deleteBomDraft} onSubmit={() => setMenuOpen(false)}>
                      <input type="hidden" name="bom_id" value={bom.id} />
                      <input type="hidden" name="variant_id" value={variantId} />
                      <button type="submit" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem">
                        Delete draft
                      </button>
                    </form>
```

with:

```tsx
                    <button
                      type="button"
                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        discardDialogRef.current?.showModal();
                      }}
                    >
                      Delete draft
                    </button>
```

Note: the `<form>` wrapper is removed from the "Delete draft" menu item — the `discardFormRef` form (Discard button) already carries the same hidden inputs and will be submitted by `requestSubmit()` from the dialog confirm button.

- [ ] **Step 4: Add the shared discard dialog JSX**

Place this dialog in the component's JSX immediately after the `saveBomDialog` from Task 5:

```tsx
      <dialog ref={discardDialogRef} className={styles.confirmDialog}>
        <p>Delete this draft? This cannot be undone.</p>
        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.btnDiscard}
            onClick={() => discardDialogRef.current?.close()}
          >
            Cancel
          </button>
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

- [ ] **Step 5: Verify**

```powershell
npx tsc --noEmit 2>&1 | Select-String "bom-editor"
```

Expected: no errors.

- [ ] **Step 6: Manual test**

1. Navigate to a variant with a draft BOM.
2. Click **Discard** — dialog appears "Delete this draft? This cannot be undone." Cancel works; Delete submits and removes the draft.
3. Create another draft. Open the ⋯ menu, click **Delete draft** — same dialog appears. Cancel closes; Delete submits.
4. Confirm the menu closes before the dialog opens (no overlapping UI).

- [ ] **Step 7: Commit**

```bash
git add src/app/app/products/bom-editor.tsx src/app/app/products/bom-editor.module.css
git commit -m "fix(products): discard and delete draft require confirmation (C2)"
```

---

## Self-review checklist

**Spec coverage:**
- A3 ✅ — split into editable/archived, `<details>/<summary>` for archived, read-only text rows
- A4 ✅ — form action has `?return_to=`, banner reads `searchParams.shopify`
- B2 ✅ — new `"use client"` `ProductFilters`, `onChange` submits form
- B3 ✅ — `tabIndex={0}`, `role="link"`, `onKeyDown` Enter/Space on coverage table rows
- C1 ✅ — "Activate BOM" button opens dialog before submitting `setBomActive`
- C2 ✅ — both Discard and Delete draft open shared dialog before submitting `deleteBomDraft`

**Placeholder scan:** None. Every step shows complete code.

**Type consistency:**
- `saveBomDialogRef`, `saveBomFormRef`, `discardDialogRef`, `discardFormRef` — all `useRef<HTMLDialog/FormElement>(null)`, consistent across Tasks 5 and 6.
- `LaborLineRecord` used in Task 1 archived rows — fields `operation_name`, `sequence`, `run_hours_per_unit`, `electricity_kwh_per_unit`, `gas_units_per_unit`, `department` all exist in the type at `[variantId]/page.tsx:75–98`.
- CSS classes `.confirmDialog`, `.confirmActions`, `.btnDanger` added in Task 5 and used in Task 6 — consistent.
