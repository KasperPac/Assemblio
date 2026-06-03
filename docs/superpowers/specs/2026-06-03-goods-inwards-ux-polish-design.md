# Design: Goods Inwards UX Polish (F-06, F-07, F-08, F-09, A-04)

**Date:** 2026-06-03  
**Status:** Approved

---

## Goal

Five small improvements to the goods inwards feature: icon fallbacks on status badges and variance (accessibility), replacement of a one-shot cost modal with a persistent card, graceful degradation of the PDF parser when unconfigured, filter-aware empty states, and a running received value total on the receipt detail page.

---

## Scope

| ID | Description | Files |
|----|-------------|-------|
| F-06 | Icon prefixes on status badges; "Short"/"Over" text on variance column | `receipt-list.tsx`, `receipt-detail.tsx` |
| F-07 | Remove cost modal; add persistent "Update component costs" card | `receipt-detail.tsx` |
| F-08 | Gray out PDF section when `ANTHROPIC_API_KEY` is not set | `goods-inwards/new/page.tsx`, `receipt-form.tsx` |
| F-09 | Filter-aware empty state messages on receipt list | `receipt-list.tsx` |
| A-04 | Total received value below lines table on receipt detail | `receipt-detail.tsx` |

No DB migrations. No new CSS files. No new components.

---

## F-06 — Icon fallbacks (accessibility)

### Status badges in `receipt-list.tsx`

The `STATUS_LABELS` record currently has plain text. Add icon prefixes so badges are distinguishable without colour:

```typescript
const STATUS_LABELS: Record<Receipt["status"], string> = {
  unmatched: "· Unmatched",
  po_linked: "✓ PO linked",
  discrepancy: "⚠ Discrepancy",
};
```

No other changes to the badge rendering.

### Variance column in `receipt-detail.tsx`

The variance cell currently renders a coloured number only (`+5`, `-2`). Append a text label for colour-blind users:

```tsx
{variance < 0
  ? `${variance} Short`
  : variance > 0
  ? `+${variance} Over`
  : "0"}
```

The `varianceShort` / `varianceOver` CSS classes remain unchanged — the text label is additive alongside the colour.

---

## F-07 — Remove cost modal; add persistent card

### Remove from `receipt-detail.tsx`

Remove all of the following (currently ~40 lines):

1. `const dismissKey = ...` (line ~142)
2. `const [showCostModal, setShowCostModal] = useState(false);` (line ~145)
3. `useEffect` that calls `localStorage.getItem(dismissKey)` and sets `showCostModal` (lines ~149–155)
4. `function dismissCostModal()` (lines ~158–160)
5. Inside `handleCostUpdate`: the call to `dismissCostModal()` — replace with just closing the pending state (keep the `updateComponentCosts` call and `dismissCostModal` → nothing needed since modal is gone)
6. The `{showCostModal && (<div className={styles.modalOverlay}>...</div>)}` JSX block (lines ~531–581)

Also remove `modalOverlay` and `modal` CSS class usage (the classes themselves may remain in the CSS file — just stop using them here).

### Add persistent card in `receipt-detail.tsx`

After the closing `</div>` of the Lines card (around line 529), add a new `formCard` that renders when `linesWithCost.length > 0`:

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
```

### Update `handleCostUpdate`

Remove the `dismissCostModal()` call — no longer needed:

```typescript
function handleCostUpdate() {
  const selected = linesWithCost
    .filter((l) => costChecked[l.id])
    .map((l) => ({ component_id: l.component_id, cost_per_unit: l.cost_per_unit }));
  startCostTransition(async () => {
    if (selected.length > 0) await updateComponentCosts(selected);
  });
}
```

### Keep unchanged

`linesWithCost`, `costChecked` state, `setCostChecked`, `costUpdatePending`, `startCostTransition` — all remain as-is.

---

## F-08 — Graceful PDF section when API key is missing

### `src/app/app/goods-inwards/new/page.tsx`

Add a `hasPdfParser` boolean derived server-side (before the `return`):

```typescript
const hasPdfParser = !!process.env.ANTHROPIC_API_KEY;
```

Pass it to `<ReceiptForm>`:

```tsx
return (
  <ReceiptForm
    ...
    hasPdfParser={hasPdfParser}
  />
);
```

### `src/app/app/goods-inwards/receipt-form.tsx`

Add `hasPdfParser: boolean` to the props type and destructuring.

When `hasPdfParser` is `false`, render the PDF card in a disabled/grayed state instead of hiding it:

```tsx
{/* PDF parse section */}
<div className={styles.formCard} style={!hasPdfParser ? { opacity: 0.55 } : undefined}>
  <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
    Parse delivery docket (optional)
  </h2>
  {hasPdfParser ? (
    <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
      Upload a PDF packing slip to pre-fill this form.
    </p>
  ) : (
    <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
      PDF parsing is not configured — contact your administrator to enable it.
    </p>
  )}
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
  {pdfError && <div className={styles.errorNotice}>{pdfError}</div>}
  {parsedBadge && !pdfError && (
    <p style={{ margin: 0, color: "var(--ok)", fontSize: "0.85rem" }}>
      ✓ Pre-filled from PDF — review and adjust below.
    </p>
  )}
</div>
```

**Note:** `opacity: 0.55` is a truly dynamic value (condition-driven), so inline style is acceptable per the design system rules.

---

## F-09 — Filter-aware empty states

### `receipt-list.tsx`

Replace the fixed `<EmptyState>` inside the table with one that adapts to `activeFilter`:

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
  ...rows...
)}
```

---

## A-04 — Total received value on receipt detail

### `receipt-detail.tsx`

`linesWithCost` is already computed. Add a `totalValue` derived value after it:

```typescript
const totalValue = linesWithCost.reduce(
  (sum, l) => sum + l.quantity_delivered * l.cost_per_unit,
  0
);
```

Render below the lines table, inside the Lines `formCard`, when `linesWithCost.length > 0`:

```tsx
{linesWithCost.length > 0 && (
  <p style={{ margin: "4px 0 0", textAlign: "right", fontSize: "0.85rem" }}>
    <span style={{ color: "var(--ink-muted)" }}>Total received value: </span>
    <strong>${totalValue.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
  </p>
)}
```

Placed after the `</table>` closing tag and before the closing `</div>` of the Lines card.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/app/app/goods-inwards/receipt-list.tsx` | F-06: icon prefixes in STATUS_LABELS; F-09: filter-aware EmptyState |
| `src/app/app/goods-inwards/receipt-detail.tsx` | F-06: variance text labels; F-07: remove modal, add persistent card, update handleCostUpdate; A-04: totalValue display |
| `src/app/app/goods-inwards/new/page.tsx` | F-08: derive and pass hasPdfParser |
| `src/app/app/goods-inwards/receipt-form.tsx` | F-08: accept hasPdfParser, conditionally disable PDF card |

---

## Success Criteria

- Status badges show `·`, `✓`, `⚠` prefix icons on the receipt list
- Variance column shows "Short" / "Over" text alongside the coloured number
- Cost update section is a permanent card below lines (not a modal); dismissing via localStorage is gone
- PDF card remains visible but grayed/disabled with an explanatory message when `ANTHROPIC_API_KEY` is not set
- Empty state message changes based on which filter tab is active
- Total received value appears below the lines table when at least one line has a cost
- `npx tsc --noEmit` passes with no errors
