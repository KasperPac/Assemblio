# Goods Inwards UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five small UX/accessibility improvements to the goods inwards feature: icon fallbacks on status badges and variance, persistent cost-update card replacing a one-shot modal, graceful PDF section when unconfigured, filter-aware empty states, and a total received value on receipt detail.

**Architecture:** All changes are confined to four files in `src/app/app/goods-inwards/`. Three tasks map naturally to file groups: list-page changes, detail-page changes, and the PDF parser prop threading. No new files, no DB changes.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, CSS Modules

**Spec:** `docs/superpowers/specs/2026-06-03-goods-inwards-ux-polish-design.md`

---

## File Map

| File | Changes |
|------|---------|
| `src/app/app/goods-inwards/receipt-list.tsx` | F-06: icon prefixes in STATUS_LABELS; F-09: filter-aware EmptyState |
| `src/app/app/goods-inwards/receipt-detail.tsx` | F-06: variance text labels; F-07: remove modal, add persistent card, update handleCostUpdate; A-04: totalValue |
| `src/app/app/goods-inwards/new/page.tsx` | F-08: derive and pass hasPdfParser |
| `src/app/app/goods-inwards/receipt-form.tsx` | F-08: accept hasPdfParser, conditionally disable PDF card |

---

## Task 1: Receipt list — icon badges (F-06) and filter-aware empty states (F-09)

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-list.tsx`

- [ ] **Step 1: Add icon prefixes to STATUS_LABELS**

  Find the `STATUS_LABELS` constant (lines 37–41):

  ```typescript
  const STATUS_LABELS: Record<Receipt["status"], string> = {
    unmatched: "Unmatched",
    po_linked: "PO linked",
    discrepancy: "Discrepancy",
  };
  ```

  Replace with:

  ```typescript
  const STATUS_LABELS: Record<Receipt["status"], string> = {
    unmatched: "· Unmatched",
    po_linked: "✓ PO linked",
    discrepancy: "⚠ Discrepancy",
  };
  ```

- [ ] **Step 2: Replace the fixed EmptyState with a filter-aware one**

  Find the empty-state `<tr>` block inside the `<tbody>` (around lines 103–111):

  ```tsx
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  title="No receipts found"
                  message="Received deliveries will appear here. Use New Receipt to log a delivery."
                />
              </td>
            </tr>
          ) : (
  ```

  Replace with:

  ```tsx
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7}>
                {activeFilter === "unmatched" ? (
                  <EmptyState
                    title="No unmatched receipts"
                    message="All receipts are linked to a purchase order."
                  />
                ) : activeFilter === "discrepancy" ? (
                  <EmptyState
                    title="No discrepancies"
                    message="All received quantities match their purchase orders."
                  />
                ) : activeFilter === "this_week" ? (
                  <EmptyState
                    title="No receipts this week"
                    message="No deliveries have been recorded in the last 7 days."
                  />
                ) : (
                  <EmptyState
                    title="No deliveries yet"
                    message="Record your first goods receipt using the New Receipt button."
                  />
                )}
              </td>
            </tr>
          ) : (
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/app/goods-inwards/receipt-list.tsx
  git commit -m "feat(goods-inwards): icon prefixes on status badges (F-06); filter-aware empty states (F-09)"
  ```

---

## Task 2: Receipt detail — variance labels (F-06), persistent cost card (F-07), total value (A-04)

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-detail.tsx`

Make these changes in the order shown — each builds on the previous.

- [ ] **Step 1: Add "Short"/"Over" text to variance rendering**

  Find the variance `<td>` cell (around lines 486–502):

  ```tsx
                  <td>
                    {variance !== null ? (
                      <span
                        className={`${styles.variance} ${
                          variance < 0
                            ? styles.varianceShort
                            : variance > 0
                            ? styles.varianceOver
                            : ""
                        }`}
                      >
                        {variance > 0 ? `+${variance}` : String(variance)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
  ```

  Replace with:

  ```tsx
                  <td>
                    {variance !== null ? (
                      <span
                        className={`${styles.variance} ${
                          variance < 0
                            ? styles.varianceShort
                            : variance > 0
                            ? styles.varianceOver
                            : ""
                        }`}
                      >
                        {variance < 0
                          ? `${variance} Short`
                          : variance > 0
                          ? `+${variance} Over`
                          : "0"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
  ```

- [ ] **Step 2: Add `totalValue` computation after `linesWithCost`**

  Find the `linesWithCost` definition (around line 141):

  ```typescript
    const linesWithCost = receipt.delivery_receipt_line.filter(
      (l): l is ReceiptLine & { cost_per_unit: number } => l.cost_per_unit !== null
    );
    const dismissKey = `dismissed_cost_modal_${receipt.id}`;
    const [showCostModal, setShowCostModal] = useState(false);
  ```

  Replace this block and everything through `function handleCostUpdate` (lines 141–171) with:

  ```typescript
    const linesWithCost = receipt.delivery_receipt_line.filter(
      (l): l is ReceiptLine & { cost_per_unit: number } => l.cost_per_unit !== null
    );
    const totalValue = linesWithCost.reduce(
      (sum, l) => sum + l.quantity_delivered * l.cost_per_unit,
      0
    );
    const [costChecked, setCostChecked] = useState<Record<string, boolean>>(
      () => Object.fromEntries(linesWithCost.map((l) => [l.id, true]))
    );
    const [costUpdatePending, startCostTransition] = useTransition();

    function handleCostUpdate() {
      const selected = linesWithCost
        .filter((l) => costChecked[l.id])
        .map((l) => ({ component_id: l.component_id, cost_per_unit: l.cost_per_unit }));
      startCostTransition(async () => {
        if (selected.length > 0) await updateComponentCosts(selected);
      });
    }
  ```

  This removes: `dismissKey`, `showCostModal` state, `useEffect` with localStorage, `dismissCostModal()`, and the `dismissCostModal()` call inside `handleCostUpdate`.

- [ ] **Step 3: Add total value display inside the Lines card**

  Find the end of the Lines card — the closing sequence after the `</table>` (around lines 527–529):

  ```tsx
          </tbody>
        </table>
        )}
      </div>
  ```

  Replace with:

  ```tsx
          </tbody>
        </table>
        )}
        {linesWithCost.length > 0 && (
          <p style={{ margin: "4px 0 0", textAlign: "right", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--ink-muted)" }}>Total received value: </span>
            <strong>
              ${totalValue.toLocaleString("en-AU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </p>
        )}
      </div>
  ```

- [ ] **Step 4: Replace the modal JSX with a persistent card**

  Find the `{showCostModal && (...)}` block (lines 531–581):

  ```tsx
      {showCostModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
              Update component prices?
            </h3>
            <p style={{ margin: "6px 0 0", color: "var(--ink-muted)", fontSize: "0.85rem" }}>
              These costs were recorded on this receipt. Select the components whose price you'd like to update.
            </p>
            <table className={styles.linesTable} style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Component</th>
                  <th>Receipt cost</th>
                </tr>
              </thead>
              <tbody>
                {linesWithCost.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={costChecked[l.id] ?? true}
                        onChange={(e) =>
                          setCostChecked((prev) => ({ ...prev, [l.id]: e.target.checked }))
                        }
                      />
                    </td>
                    <td>{resolveComponentName(l)}</td>
                    <td>${l.cost_per_unit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.actions} style={{ marginTop: 16 }}>
              <button type="button" className={styles.secondary} onClick={dismissCostModal}>
                Skip
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={costUpdatePending || !linesWithCost.some((l) => costChecked[l.id])}
                onClick={handleCostUpdate}
              >
                {costUpdatePending ? "Updating…" : "Update selected"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
  ```

  Replace with:

  ```tsx
      {linesWithCost.length > 0 && (
        <div className={styles.formCard}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
            Update component costs
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--ink-muted)", fontSize: "0.85rem" }}>
            Select which components to update with the costs captured on this receipt.
          </p>
          <table className={styles.linesTable}>
            <thead>
              <tr>
                <th></th>
                <th>Component</th>
                <th>Receipt cost</th>
              </tr>
            </thead>
            <tbody>
              {linesWithCost.map((l) => (
                <tr key={l.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={costChecked[l.id] ?? true}
                      onChange={(e) =>
                        setCostChecked((prev) => ({ ...prev, [l.id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td>{resolveComponentName(l)}</td>
                  <td>${l.cost_per_unit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={costUpdatePending || !linesWithCost.some((l) => costChecked[l.id])}
              onClick={handleCostUpdate}
            >
              {costUpdatePending ? "Updating…" : "Update selected"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
  ```

- [ ] **Step 5: Remove unused `useEffect` import if it's now unused**

  Check the import at the top of the file:

  ```typescript
  import { useEffect, useRef, useState, useTransition } from "react";
  ```

  The `useEffect` was only used for the cost modal. Remove it:

  ```typescript
  import { useRef, useState, useTransition } from "react";
  ```

  Also remove the `updateComponentCosts` import from `./actions` only if it's no longer used. But `handleCostUpdate` still calls it, so **keep it**.

- [ ] **Step 6: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors. If there's an error about `useEffect` being used somewhere else in the file, restore it — double-check with `grep useEffect receipt-detail.tsx`.

- [ ] **Step 7: Smoke test**

  ```
  1. Open any receipt detail with costed lines
  2. Verify variance column shows "X Short" or "+X Over" text alongside the colour
  3. Verify "Update component costs" card appears below the lines table (always, not as a popup)
  4. Verify the total received value appears below the lines table (right-aligned)
  5. Open a receipt with no costed lines — verify neither the cost card nor the total appear
  6. Check localStorage in DevTools — verify no dismissed_cost_modal_* keys are being set
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add src/app/app/goods-inwards/receipt-detail.tsx
  git commit -m "feat(goods-inwards): variance labels (F-06); persistent cost card (F-07); total value (A-04)"
  ```

---

## Task 3: PDF section graceful degradation (F-08)

**Files:**
- Modify: `src/app/app/goods-inwards/new/page.tsx`
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`

- [ ] **Step 1: Derive `hasPdfParser` in `new/page.tsx` and pass it to `<ReceiptForm>`**

  Find the `return` block (lines 99–109):

  ```tsx
    return (
      <ReceiptForm
        suppliers={suppliersResult.data ?? []}
        components={components}
        locations={locations}
        supplierComponentMap={supplierComponentMap}
        availablePOs={availablePOs}
        initialPoId={initialPoId}
        initialComponentId={initialComponentId ?? null}
      />
    );
  ```

  Replace with:

  ```tsx
    const hasPdfParser = !!process.env.ANTHROPIC_API_KEY;

    return (
      <ReceiptForm
        suppliers={suppliersResult.data ?? []}
        components={components}
        locations={locations}
        supplierComponentMap={supplierComponentMap}
        availablePOs={availablePOs}
        initialPoId={initialPoId}
        initialComponentId={initialComponentId ?? null}
        hasPdfParser={hasPdfParser}
      />
    );
  ```

- [ ] **Step 2: Add `hasPdfParser` to `ReceiptForm` props and use it in the PDF card**

  In `receipt-form.tsx`, find the component signature and props type (lines 65–81):

  ```typescript
  export default function ReceiptForm({
    suppliers,
    components,
    locations,
    supplierComponentMap,
    availablePOs,
    initialPoId,
    initialComponentId,
  }: {
    suppliers: Supplier[];
    components: Component[];
    locations: Location[];
    supplierComponentMap: Record<string, string[]>;
    availablePOs: AvailablePO[];
    initialPoId?: string;
    initialComponentId?: string | null;
  }) {
  ```

  Replace with:

  ```typescript
  export default function ReceiptForm({
    suppliers,
    components,
    locations,
    supplierComponentMap,
    availablePOs,
    initialPoId,
    initialComponentId,
    hasPdfParser,
  }: {
    suppliers: Supplier[];
    components: Component[];
    locations: Location[];
    supplierComponentMap: Record<string, string[]>;
    availablePOs: AvailablePO[];
    initialPoId?: string;
    initialComponentId?: string | null;
    hasPdfParser: boolean;
  }) {
  ```

- [ ] **Step 3: Update the PDF card to use `hasPdfParser`**

  Find the `{/* PDF parse section */}` block (lines 333–365):

  ```tsx
      {/* PDF parse section */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Parse delivery docket (optional)
        </h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
          Upload a PDF packing slip to pre-fill this form.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className={styles.secondary}
            onClick={handlePdfParse}
            disabled={pdfParsing}
          >
            {pdfParsing ? "Parsing…" : "Parse PDF"}
          </button>
        </div>
        {pdfError && (
          <div className={styles.errorNotice}>{pdfError}</div>
        )}
        {parsedBadge && !pdfError && (
          <p style={{ margin: 0, color: "var(--ok)", fontSize: "0.85rem" }}>
            ✓ Pre-filled from PDF — review and adjust below.
          </p>
        )}
      </div>
  ```

  Replace with:

  ```tsx
      {/* PDF parse section */}
      <div className={styles.formCard} style={!hasPdfParser ? { opacity: 0.55 } : undefined}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Parse delivery docket (optional)
        </h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
          {hasPdfParser
            ? "Upload a PDF packing slip to pre-fill this form."
            : "PDF parsing is not configured — contact your administrator to enable it."}
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ flex: 1 }}
            disabled={!hasPdfParser}
          />
          <button
            type="button"
            className={styles.secondary}
            onClick={handlePdfParse}
            disabled={pdfParsing || !hasPdfParser}
          >
            {pdfParsing ? "Parsing…" : "Parse PDF"}
          </button>
        </div>
        {pdfError && (
          <div className={styles.errorNotice}>{pdfError}</div>
        )}
        {parsedBadge && !pdfError && (
          <p style={{ margin: 0, color: "var(--ok)", fontSize: "0.85rem" }}>
            ✓ Pre-filled from PDF — review and adjust below.
          </p>
        )}
      </div>
  ```

- [ ] **Step 4: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 5: Smoke test**

  ```
  With ANTHROPIC_API_KEY set:
  1. Open /app/goods-inwards/new
  2. Verify PDF section appears normally (not grayed out)
  3. Verify file input and "Parse PDF" button are enabled

  Without ANTHROPIC_API_KEY (temporarily unset or test with !hasPdfParser=false):
  4. Verify the PDF card appears grayed out (opacity reduced)
  5. Verify the description says "PDF parsing is not configured..."
  6. Verify file input and "Parse PDF" button are disabled
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/app/goods-inwards/new/page.tsx src/app/app/goods-inwards/receipt-form.tsx
  git commit -m "feat(goods-inwards): graceful PDF section when API key not configured (F-08)"
  ```

---

## Self-Review Checklist

After all three tasks are committed:

- [ ] Receipt list status badges show `·`, `✓`, `⚠` prefixes (F-06)
- [ ] Variance column in detail shows "Short" / "Over" text — zero shows `0` without a label (F-06)
- [ ] No `showCostModal`, `dismissKey`, `localStorage` references remain in `receipt-detail.tsx` (F-07)
- [ ] `useEffect` import removed from `receipt-detail.tsx` if no longer used (F-07)
- [ ] "Update component costs" card appears permanently when any line has a cost (F-07)
- [ ] "Skip" button from the old modal is gone (F-07)
- [ ] Total received value appears below lines table when `linesWithCost.length > 0` (A-04)
- [ ] PDF card grays out (opacity 0.55) and disables inputs when `hasPdfParser` is false (F-08)
- [ ] Filter-aware empty states: each tab shows a different title + message (F-09)
- [ ] `npx tsc --noEmit` passes with no errors
