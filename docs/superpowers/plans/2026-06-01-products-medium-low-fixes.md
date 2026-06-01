# Products Medium/Low Priority Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 remaining findings (A5, B4, B5, C3, C4, C5, B6, C6) from the products pre-launch review — all medium or low priority.

**Architecture:** Pure code fixes — no new routes, no DB migrations. C3 is the trickiest change: removing the `redirect()` from the three routing server actions so they re-render in place (no scroll reset). C5 restructures the BOM lightbox by moving template/copy forms from the footer to the top. All other tasks are localised JSX/CSS edits.

**Tech Stack:** Next.js 15 App Router, CSS Modules, TypeScript, sanitize-html (B6 only)

---

## File Map

| File | Action | Covers |
|------|--------|--------|
| `src/app/app/products/product-variant-picker.tsx` | **Delete** | A5 |
| `src/app/app/products/bom-editor.tsx` | Modify — add `aria-label` to remove button | B4 |
| `src/app/app/products/bom-lightbox.tsx` | Modify — add `aria-label` to remove button; promote start-from forms | B4, C5 |
| `src/app/app/products/bom-lightbox.module.css` | Modify — add start-from CSS classes | C5 |
| `src/app/app/products/page.tsx` | Modify — add `data-label` to table row spans | B5 |
| `src/app/app/products/products.module.css` | Modify — add mobile `::before` label CSS | B5 |
| `src/app/app/products/actions.ts` | Modify — remove success `redirect()` from 3 labor actions | C3 |
| `src/app/app/products/variants/[variantId]/page.tsx` | Modify — remove Shopify ID from card; simplify defaultTab; enrich Overview tab | C3 cleanup, C4, C6 |
| `src/app/app/products/[productId]/page.tsx` | Modify — remove Shopify ID from PageHeader description; sanitise description | C4, B6 |
| `src/lib/utils/sanitize.ts` | **Create** | B6 |

---

## Task 1 — A5: Delete orphaned file

**Files:**
- Delete: `src/app/app/products/product-variant-picker.tsx`

The file `product-variant-picker.tsx` references `styles.variantSelect` from `product-detail.module.css` (which doesn't exist) and is never imported anywhere. It was superseded by the variant coverage table.

- [ ] **Step 1: Confirm no imports**

```powershell
cd C:\dev\assemblio; Select-String -Path "src\**\*.tsx","src\**\*.ts" -Pattern "product-variant-picker" -Recurse
```

Expected: no results.

- [ ] **Step 2: Delete the file**

```powershell
Remove-Item "src\app\app\products\product-variant-picker.tsx"
```

- [ ] **Step 3: Commit**

```powershell
git add -A
git commit -m "fix(products): delete orphaned product-variant-picker (A5)"
```

---

## Task 2 — B4: aria-labels on remove buttons

**Files:**
- Modify: `src/app/app/products/bom-editor.tsx` (around line 427)
- Modify: `src/app/app/products/bom-lightbox.tsx` (around line 377)

Both files render `<button>✕</button>` with no accessible label.

### bom-editor.tsx

Find the remove button (around line 427):
```tsx
                        <button type="submit" className={styles.removeBtn}>
                          ✕
                        </button>
```

The button is inside a `line` map where `line.component.name` is available. Replace with:
```tsx
                        <button
                          type="submit"
                          className={styles.removeBtn}
                          aria-label={`Remove ${line.component.name}`}
                        >
                          ✕
                        </button>
```

### bom-lightbox.tsx

Find the remove button in the preview table (around line 377):
```tsx
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => toggleComponent(c.id)}
                        >
                          ✕
                        </button>
```

The button is inside a `selectedComponents.map((c) => ...)` block so `c.name` is available. Replace with:
```tsx
                        <button
                          type="button"
                          className={styles.removeBtn}
                          aria-label={`Remove ${c.name}`}
                          onClick={() => toggleComponent(c.id)}
                        >
                          ✕
                        </button>
```

- [ ] **Step 1: Apply both changes** (as shown above)

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "bom-editor|bom-lightbox"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/app/app/products/bom-editor.tsx src/app/app/products/bom-lightbox.tsx
git commit -m "fix(products): add aria-label to remove buttons in BOM editor and lightbox (B4)"
```

---

## Task 3 — B5: Mobile product list column labels

**Files:**
- Modify: `src/app/app/products/page.tsx` (tableRow spans ~lines 372–392)
- Modify: `src/app/app/products/products.module.css` (media query ~lines 162–175)

On mobile (<900px) the column header is hidden (`display: none`) and the row collapses to a single column. Each data span has no label.

### Step 1: Add data-label attributes in page.tsx

Find the `<span>` elements inside the `filteredProducts.map` return (after the product Link cell). The current code:

```tsx
                <span className={styles.variantCount}>{productVariants.length}</span>

                <span
                  className={`${styles.statusBadge} ${
                    productVariants.length > 0 ? styles.statusActive : styles.statusPending
                  }`}
                >
                  {statusLabel}
                </span>

                <span className={styles.sellPriceCell}>
                  {sellPrice != null ? formatCurrency(sellPrice) : "—"}
                </span>

                <span className={`${styles.gpCell} ${gpClassFor(avgMatGpPct)}`}>
                  {avgMatGpPct != null ? `${(avgMatGpPct * 100).toFixed(0)}%` : "—"}
                </span>

                <span className={`${styles.gpCell} ${gpClassFor(avgActualGpPct)}`}>
                  {avgActualGpPct != null ? `${(avgActualGpPct * 100).toFixed(0)}%` : "—"}
                </span>
```

Replace with:

```tsx
                <span className={styles.variantCount} data-label="Variants">{productVariants.length}</span>

                <span
                  className={`${styles.statusBadge} ${
                    productVariants.length > 0 ? styles.statusActive : styles.statusPending
                  }`}
                  data-label="Status"
                >
                  {statusLabel}
                </span>

                <span className={styles.sellPriceCell} data-label="Sell Price">
                  {sellPrice != null ? formatCurrency(sellPrice) : "—"}
                </span>

                <span className={`${styles.gpCell} ${gpClassFor(avgMatGpPct)}`} data-label="Mat. GP %">
                  {avgMatGpPct != null ? `${(avgMatGpPct * 100).toFixed(0)}%` : "—"}
                </span>

                <span className={`${styles.gpCell} ${gpClassFor(avgActualGpPct)}`} data-label="Actual GP %">
                  {avgActualGpPct != null ? `${(avgActualGpPct * 100).toFixed(0)}%` : "—"}
                </span>
```

### Step 2: Add mobile label CSS to products.module.css

Find the existing `@media (max-width: 900px)` block (starts around line 162) and add inside it:

```css
@media (max-width: 900px) {
  .filters {
    grid-template-columns: 1fr;
  }

  .tableHeader {
    display: none;
  }

  .tableRow {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .tableRow > [data-label] {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .tableRow > [data-label]::before {
    content: attr(data-label) ":";
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-muted);
    min-width: 90px;
    flex-shrink: 0;
  }
}
```

- [ ] **Step 1: Apply data-label attrs in page.tsx** (as shown above)
- [ ] **Step 2: Add CSS to products.module.css** (as shown above — replace the full media query block)
- [ ] **Step 3: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "products/page"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/app/app/products/page.tsx src/app/app/products/products.module.css
git commit -m "fix(products): mobile product list shows column labels via data-label (B5)"
```

---

## Task 4 — C3: Routing save no longer resets scroll

**Files:**
- Modify: `src/app/app/products/actions.ts` (lines 476–480, 579–583, 618–622)
- Modify: `src/app/app/products/variants/[variantId]/page.tsx` (searchParams type + defaultTab)

**Root cause:** `createBomLaborLine`, `updateBomLaborLine`, and `deleteBomLaborLine` all call `redirectVariantResult()` on success, which calls `redirect()` — a full page navigation that resets scroll to the top. Since `revalidatePath` is already called before the redirect, removing the `redirect()` causes Next.js to re-render in place with no scroll reset.

### Step 1: Remove success redirect in createBomLaborLine

Find in `actions.ts` (lines 476–480):
```typescript
  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
  redirectVariantResult(variantId, {
    laborSuccess: encodeMessage(`Added labor operation "${operationName}".`),
  });
}
```

Replace with:
```typescript
  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
}
```

### Step 2: Remove success redirect in updateBomLaborLine

Find (lines 579–583):
```typescript
  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
  redirectVariantResult(variantId, {
    laborSuccess: encodeMessage(`Updated labor operation "${operationName}".`),
  });
}
```

Replace with:
```typescript
  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
}
```

### Step 3: Remove success redirect in deleteBomLaborLine

Find (lines 618–622):
```typescript
  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
  redirectVariantResult(variantId, {
    laborSuccess: encodeMessage("Removed labor operation."),
  });
}
```

Replace with:
```typescript
  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
}
```

### Step 4: Clean up searchParams in [variantId]/page.tsx

In `[variantId]/page.tsx`, find the `searchParams` type:
```typescript
  searchParams?: Promise<{
    laborSuccess?: string;
    laborError?: string;
    tab?: string;
    notifSuccess?: string;
    notifError?: string;
  }>;
```

Remove `laborSuccess?: string;` since it will never appear in the URL after this fix.

Also find the `defaultTab` derivation (around line 516):
```typescript
      : query.laborSuccess || query.laborError
        ? "routing"
```

Change to:
```typescript
      : query.laborError
        ? "routing"
```

- [ ] **Step 1: Remove redirect from createBomLaborLine** (as shown above)
- [ ] **Step 2: Remove redirect from updateBomLaborLine** (as shown above)
- [ ] **Step 3: Remove redirect from deleteBomLaborLine** (as shown above)
- [ ] **Step 4: Clean up searchParams type and defaultTab** (as shown above)
- [ ] **Step 5: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "actions|variantId"
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/app/app/products/actions.ts "src/app/app/products/variants/[variantId]/page.tsx"
git commit -m "fix(products): routing saves no longer scroll to top (C3)"
```

---

## Task 5 — C4: Remove Shopify IDs from primary UI

**Files:**
- Modify: `src/app/app/products/[productId]/page.tsx` (line ~318)
- Modify: `src/app/app/products/variants/[variantId]/page.tsx` (line ~539)

Shopify IDs are internal identifiers with no meaning to end users. They remain in the DB and are still visible in the Overview tab for the variant. Removing from the primary header/card cleans up visual noise.

### [productId]/page.tsx

Find line ~318:
```tsx
      description={`Shopify ID: ${product.shopify_id} · ${variants.length} variant${variants.length === 1 ? "" : "s"} · ${syncLabel} ${timeAgo(lastSync)}`}
```

Replace with:
```tsx
      description={`${variants.length} variant${variants.length === 1 ? "" : "s"} · ${syncLabel} ${timeAgo(lastSync)}`}
```

### [variantId]/page.tsx

Find line ~539 (inside `<section className={styles.card}>`):
```tsx
        <p className={styles.meta}>Shopify ID: {typedVariant.shopify_id}</p>
```

Remove that line entirely. The Shopify ID remains visible in the Overview tab at line ~557.

- [ ] **Step 1: Apply both changes** (as shown above)
- [ ] **Step 2: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "productId|variantId"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add "src/app/app/products/[productId]/page.tsx" "src/app/app/products/variants/[variantId]/page.tsx"
git commit -m "fix(products): remove Shopify IDs from primary header and variant card (C4)"
```

---

## Task 6 — C5: Promote template/copy options in BOM lightbox

**Files:**
- Modify: `src/app/app/products/bom-lightbox.tsx`
- Modify: `src/app/app/products/bom-lightbox.module.css`

### Background

`ComponentPicker` currently shows the "copy from variant" and "from template" forms tucked in the footer (`previewFooter`). These only appear when `!bomId` (no BOM exists yet) and `sourceBoms.length > 0` / `templates.length > 0`. Users see a large component picker and miss these shortcuts.

The fix: add a "Start from" bar above the search row that shows these forms prominently. Remove them from the footer.

### Step 1: Add CSS to bom-lightbox.module.css

Append:

```css
/* ── Start-from bar ─────────────────────────────────── */

.startFromBar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--bg-card-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--stroke);
  margin-bottom: 4px;
}

.startFromLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-muted);
  white-space: nowrap;
}

.startFromForm {
  display: flex;
  align-items: center;
  gap: 6px;
}

.startFromSelect {
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  color: var(--ink-strong);
  font-family: inherit;
}

.startFromBtn {
  font-size: 13px;
  padding: 4px 10px;
  border: 1px solid var(--stroke);
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  color: var(--ink-strong);
  cursor: pointer;
  font-family: inherit;
}

.startFromBtn:hover {
  background: var(--bg-card-2);
}

.startFromError {
  font-size: 12px;
  color: var(--danger);
  padding: 0 14px 6px;
}
```

### Step 2: Add start-from bar JSX in bom-lightbox.tsx

In the `ComponentPicker` return, the JSX currently starts with:
```tsx
  return (
    <div className={styles.pickerLayout}>
      {/* Search bar — full width */}
      <div className={styles.searchRow}>
```

Add the start-from bar immediately before the search row:

```tsx
  return (
    <div className={styles.pickerLayout}>
      {!bomId && (templates.length > 0 || sourceBoms.length > 0) && (
        <div className={styles.startFromBar}>
          <span className={styles.startFromLabel}>Start from:</span>
          {templates.length > 0 && (
            <form action={templateAction} className={styles.startFromForm}>
              <input type="hidden" name="target_variant_id" value={variantId} />
              <select name="template_id" required className={styles.startFromSelect}>
                <option value="">Choose template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.lineCount} line{t.lineCount === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
              <button type="submit" className={styles.startFromBtn}>Use template</button>
            </form>
          )}
          {sourceBoms.length > 0 && (
            <form action={copyAction} className={styles.startFromForm}>
              <input type="hidden" name="target_variant_id" value={variantId} />
              <select name="source_bom_id" required className={styles.startFromSelect}>
                <option value="">Copy from variant…</option>
                {sourceBoms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <button type="submit" className={styles.startFromBtn}>Copy</button>
            </form>
          )}
        </div>
      )}
      {(templateState?.error || copyState?.error) && (
        <p className={styles.startFromError}>
          {templateState?.error ?? copyState?.error}
        </p>
      )}

      {/* Search bar — full width */}
      <div className={styles.searchRow}>
```

### Step 3: Remove footer template/copy forms

In the `previewFooter` section (after line ~393), find and remove these two conditional form blocks from the footer:

```tsx
            {!bomId && sourceBoms.length > 0 && (
              <form action={copyAction} style={{ display: "inline" }}>
                <input type="hidden" name="target_variant_id" value={variantId} />
                <select name="source_bom_id" required className={styles.footerSelect}>
                  <option value="">copy from variant…</option>
                  {sourceBoms.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className={styles.linkBtn}>
                  copy
                </button>
              </form>
            )}
            {!bomId && templates.length > 0 && (
              <form action={templateAction} style={{ display: "inline" }}>
                <input type="hidden" name="target_variant_id" value={variantId} />
                <select name="template_id" required className={styles.footerSelect}>
                  <option value="">from template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={styles.linkBtn}>
                  use
                </button>
              </form>
            )}
```

Remove both blocks. The footer now only contains the cost total and the Save button.

- [ ] **Step 1: Add CSS to bom-lightbox.module.css** (as shown above)
- [ ] **Step 2: Add start-from bar JSX before search row** (as shown above)
- [ ] **Step 3: Remove footer template/copy forms** (as shown above)
- [ ] **Step 4: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "bom-lightbox"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/app/app/products/bom-lightbox.tsx src/app/app/products/bom-lightbox.module.css
git commit -m "fix(products): promote template/copy shortcuts to top of BOM lightbox (C5)"
```

---

## Task 7 — B6: Sanitise product description HTML (Low priority)

**Files:**
- Create: `src/lib/utils/sanitize.ts`
- Modify: `src/app/app/products/[productId]/page.tsx`

Product descriptions from Shopify are already sanitised by Shopify's API, but rendering unsanitised HTML via `dangerouslySetInnerHTML` creates an XSS surface for any future description source.

### Step 1: Install sanitize-html

```powershell
cd C:\dev\assemblio; npm install sanitize-html @types/sanitize-html
```

Expected: package added to `node_modules` and `package.json`.

### Step 2: Create src/lib/utils/sanitize.ts

```typescript
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "b", "i", "em", "strong", "a", "p", "br",
  "ul", "ol", "li", "h2", "h3", "h4", "span",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
  "*": ["class"],
};

export function sanitizeProductHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
  });
}
```

### Step 3: Use sanitizer in [productId]/page.tsx

Add import at top of `src/app/app/products/[productId]/page.tsx` (after existing imports):
```typescript
import { sanitizeProductHtml } from "@/lib/utils/sanitize";
```

Find the `dangerouslySetInnerHTML` usage (around line 334):
```tsx
            <div
              className={styles.productDescription}
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
```

Replace with:
```tsx
            <div
              className={styles.productDescription}
              dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(product.description) }}
            />
```

### Step 4: TypeScript check

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "sanitize|productId"
```

Expected: no errors.

### Step 5: Commit

```powershell
git add src/lib/utils/sanitize.ts "src/app/app/products/[productId]/page.tsx" package.json package-lock.json
git commit -m "fix(products): sanitise product description HTML before rendering (B6)"
```

---

## Task 8 — C6: Enrich Overview tab with BOM summary (Low priority)

**Files:**
- Modify: `src/app/app/products/variants/[variantId]/page.tsx` (overview tab JSX, ~lines 544–572)

### Background

The Overview tab has five fields: title, SKU, Shopify ID, price, created date. After C4, Shopify ID is removed from the card above but stays in the overview. The tab still lacks BOM context.

Data already computed in the page:
- `activeBom` — the active BOM (or `null`)
- `draftBom` — the current draft BOM (or `null`)
- `linesByBom` — `Record<string, BomLineRecord[]>` keyed by BOM id

### Step 1: Add BOM summary to the overview dl

Find the `<dl>` block (around line 546). It currently ends with the "Created" entry:
```tsx
              <div>
                <dt className={styles.overviewLabel}>Created</dt>
                <dd className={styles.overviewValue}>
                  {new Date(typedVariant.created_at).toLocaleDateString("en-AU")}
                </dd>
              </div>
            </dl>
```

After the "Created" div and before `</dl>`, add:

```tsx
              <div>
                <dt className={styles.overviewLabel}>BOM</dt>
                <dd className={styles.overviewValue}>
                  {activeBom
                    ? `v${activeBom.version} active · ${linesByBom[activeBom.id]?.length ?? 0} component${(linesByBom[activeBom.id]?.length ?? 0) === 1 ? "" : "s"}${draftBom ? ` · v${draftBom.version} draft in progress` : ""}`
                    : draftBom
                      ? `v${draftBom.version} draft · ${linesByBom[draftBom.id]?.length ?? 0} component${(linesByBom[draftBom.id]?.length ?? 0) === 1 ? "" : "s"} · not yet active`
                      : "No BOM created"
                  }
                </dd>
              </div>
```

### Step 2: TypeScript check

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "variantId"
```

Expected: no errors.

### Step 3: Commit

```powershell
git add "src/app/app/products/variants/[variantId]/page.tsx"
git commit -m "fix(products): enrich Overview tab with active BOM summary (C6)"
```

---

## Self-review

**Spec coverage:**
- A5 ✅ — orphaned file deleted
- B4 ✅ — `aria-label` on both remove buttons
- B5 ✅ — `data-label` + CSS `::before` on mobile product list cells
- C3 ✅ — success `redirect()` removed from three labor actions; defaultTab cleaned up
- C4 ✅ — Shopify ID removed from product PageHeader description and variant card `<p>`
- C5 ✅ — template/copy forms moved from footer to top "Start from" bar; footer cleaned up
- B6 ✅ — `sanitize-html` utility + used in productId page
- C6 ✅ — BOM summary (version, component count, draft status) added to Overview tab `<dl>`

**Placeholder scan:** None. Every step shows complete code.

**Type consistency:**
- `activeBom`, `draftBom`, `linesByBom` used in Tasks 4 and 8 — all defined at `[variantId]/page.tsx:312–313, 251` (already in scope, confirmed during code reading)
- `sanitizeProductHtml` created in Task 7 Step 2 and imported in Task 7 Step 3 — consistent name
- `templateState`, `copyState`, `templateAction`, `copyAction` used in C5 start-from bar — all already exist as props passed into `ComponentPicker` (confirmed from `bom-lightbox.tsx:54–55, 113–116`)
