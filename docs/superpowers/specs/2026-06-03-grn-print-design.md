# Design: A-03 — Printable Goods Received Note (GRN)

**Date:** 2026-06-03  
**Status:** Approved

---

## Goal

Add a print-optimised GRN document at `/app/goods-inwards/[id]/print` so warehouse staff can produce a paper record of a delivery receipt. A "Print GRN" button on the receipt detail page opens it in a new tab. The document shows company name, receipt reference, supplier, date, location, PO reference, full lines table with quantities/variances/costs, a total received value, and a signature line.

---

## Scope

- Two new files: `[id]/print/layout.tsx` (passthrough) and `[id]/print/page.tsx` (GRN document)
- One modified file: `receipt-detail.tsx` — add "Print GRN" link in view-mode header
- No DB migrations. No new CSS files. No new components.

---

## Route & Architecture

New route: `src/app/app/goods-inwards/[id]/print/`

### `layout.tsx`

Passthrough — strips the app shell so only the GRN document renders. Identical to the existing stocktake print layout pattern:

```tsx
import type { ReactNode } from "react";

export default function GrnPrintLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

### `page.tsx`

Server component. Fetches receipt + tenant name, renders pure HTML with an inline `<style>` block. Follows the exact pattern of `src/app/app/stocktake/[sessionId]/print/page.tsx` — no design system tokens, plain print-safe CSS only.

Props type:
```typescript
type Props = {
  params: Promise<{ id: string }>;
};
```

---

## Data

Two queries in `Promise.all`:

```typescript
const [{ data: receipt }, { data: tenant }] = await Promise.all([
  supabase
    .from("delivery_receipt")
    .select(`
      id, supplier_reference, received_at, notes, purchase_order_id, status,
      supplier:supplier_id(name),
      location:location_id(name),
      delivery_receipt_line(
        id, quantity_delivered, quantity_expected, cost_per_unit,
        notes, batch_number,
        component:component_id(name, sku)
      )
    `)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single(),
  supabase
    .from("tenant")
    .select("name")
    .eq("id", tenantId)
    .single(),
]);

if (!receipt) notFound();
```

Helper types (defined locally in the file):

```typescript
type GrnLine = {
  id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
  batch_number: string | null;
  component:
    | { name: string; sku: string | null }
    | Array<{ name: string; sku: string | null }>
    | null;
};
```

Derived values computed inline before the return:
- `companyName` — `tenant?.name ?? ""`
- `supplierName` — resolve `receipt.supplier` (may be array or object)
- `locationName` — resolve `receipt.location`
- `lines` — cast `receipt.delivery_receipt_line` as `GrnLine[]`
- `totalValue` — `lines.reduce(...)` over lines where both `quantity_delivered` and `cost_per_unit` are non-null; `null` if no costed lines exist
- `dateStr` — `received_at` formatted `d MMMM yyyy` en-AU

---

## GRN Document

### CSS (inline `<style>` block)

```css
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 24px 32px; font-size: 0.88rem; }
@media print {
  body { padding: 0; }
  .no-print { display: none !important; }
}
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
.company { font-size: 1.1rem; font-weight: 700; margin: 0 0 2px; }
.doc-title { font-size: 1.1rem; font-weight: 700; text-align: right; margin: 0 0 4px; }
.doc-ref { font-size: 0.82rem; color: #444; text-align: right; margin: 0; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; font-size: 0.85rem; }
.meta-label { color: #555; }
table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 8px; }
th { text-align: left; padding: 6px 6px; font-size: 0.75rem; border-bottom: 1px solid #888; font-weight: 600; }
th.r { text-align: right; }
td { padding: 6px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
td.r { text-align: right; }
.total-row { margin-top: 8px; text-align: right; font-size: 0.85rem; }
.sig-block { margin-top: 24px; display: flex; gap: 48px; }
.sig-field { flex: 1; }
.sig-label { font-size: 0.75rem; color: #555; margin-bottom: 4px; }
.sig-line { border-bottom: 1px solid #111; height: 24px; }
footer { margin-top: 16px; font-size: 0.72rem; color: #888; border-top: 1px solid #ddd; padding-top: 6px; }
.print-btn { margin-bottom: 16px; padding: 8px 16px; font-size: 0.9rem; cursor: pointer; }
```

### Print button

```tsx
<button className="print-btn no-print" onClick={undefined} id="print-btn">
  Print GRN
</button>
<script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-btn').onclick=function(){window.print();};" }} />
```

### Header

```tsx
<div className="header">
  <div>
    <p className="company">{companyName}</p>
  </div>
  <div>
    <p className="doc-title">GOODS RECEIVED NOTE</p>
    <p className="doc-ref">GRN: {receipt.supplier_reference}</p>
  </div>
</div>
```

### Meta grid (2-column)

```tsx
<div className="meta-grid">
  <div><span className="meta-label">Supplier: </span>{supplierName}</div>
  <div><span className="meta-label">Date received: </span>{dateStr}</div>
  <div><span className="meta-label">Location: </span>{locationName}</div>
  <div>
    <span className="meta-label">Purchase Order: </span>
    {receipt.purchase_order_id
      ? `PO-${receipt.purchase_order_id.slice(0, 8).toUpperCase()}`
      : "—"}
  </div>
</div>
```

### Lines table

Columns: **Component** | **SKU** | **Expected** | **Delivered** | **Variance** | **Cost/unit** | **Total** | **Batch #** | **Note**

Variance logic (same as `computeVariance` in `helpers.ts`):
- If `quantity_expected` is null → `—`
- Otherwise → `delivered − expected`, display as `+N` / `−N` / `0`

Cost total per line: `quantity_delivered × cost_per_unit`, formatted as `$X.XX`. Display `—` when `cost_per_unit` is null.

```tsx
<table>
  <thead>
    <tr>
      <th>Component</th>
      <th>SKU</th>
      <th className="r">Expected</th>
      <th className="r">Delivered</th>
      <th className="r">Variance</th>
      <th className="r">Cost / unit</th>
      <th className="r">Total</th>
      <th>Batch #</th>
      <th>Note</th>
    </tr>
  </thead>
  <tbody>
    {lines.map((line) => {
      const comp = Array.isArray(line.component) ? line.component[0] : line.component;
      const variance = line.quantity_expected !== null
        ? line.quantity_delivered - line.quantity_expected
        : null;
      const lineTotal = line.cost_per_unit !== null
        ? line.quantity_delivered * line.cost_per_unit
        : null;
      return (
        <tr key={line.id}>
          <td>{comp?.name ?? "—"}</td>
          <td>{comp?.sku ?? "—"}</td>
          <td className="r">{line.quantity_expected ?? "—"}</td>
          <td className="r">{line.quantity_delivered}</td>
          <td className="r">
            {variance === null ? "—"
              : variance > 0 ? `+${variance}`
              : String(variance)}
          </td>
          <td className="r">
            {line.cost_per_unit !== null ? `$${line.cost_per_unit.toFixed(2)}` : "—"}
          </td>
          <td className="r">
            {lineTotal !== null ? `$${lineTotal.toFixed(2)}` : "—"}
          </td>
          <td>{line.batch_number ?? "—"}</td>
          <td>{line.notes ?? ""}</td>
        </tr>
      );
    })}
  </tbody>
</table>
```

### Total received value

Only rendered when at least one line has a cost:

```tsx
{totalValue !== null && (
  <div className="total-row">
    <strong>Total received value: ${totalValue.toFixed(2)}</strong>
  </div>
)}
```

### Signature block

```tsx
<div className="sig-block">
  <div className="sig-field">
    <p className="sig-label">Received by:</p>
    <div className="sig-line" />
  </div>
  <div className="sig-field">
    <p className="sig-label">Date:</p>
    <div className="sig-line" />
  </div>
  <div className="sig-field">
    <p className="sig-label">Signature:</p>
    <div className="sig-line" />
  </div>
</div>
```

### Footer

```tsx
<footer>
  Generated by Manuva · {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
</footer>
```

---

## "Print GRN" Button in Receipt Detail

In `receipt-detail.tsx`, view-mode header only (inside the `else` branch, in the `<div>` containing the status badge and Edit button):

Current:
```tsx
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`${styles.badge} ${styles[`badge_${receipt.status}`]}`}>
                {STATUS_LABELS[receipt.status]}
              </span>
              <button type="button" className={styles.secondary} onClick={() => setIsEditing(true)}>
                Edit
              </button>
            </div>
```

Replace with:
```tsx
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`${styles.badge} ${styles[`badge_${receipt.status}`]}`}>
                {STATUS_LABELS[receipt.status]}
              </span>
              <a
                href={`/app/goods-inwards/${receipt.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.secondary}
              >
                Print GRN
              </a>
              <button type="button" className={styles.secondary} onClick={() => setIsEditing(true)}>
                Edit
              </button>
            </div>
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/app/goods-inwards/[id]/print/layout.tsx` | New — passthrough layout |
| `src/app/app/goods-inwards/[id]/print/page.tsx` | New — GRN server component |
| `src/app/app/goods-inwards/receipt-detail.tsx` | Add "Print GRN" link in view-mode header |

---

## Success Criteria

- Navigating to `/app/goods-inwards/{id}/print` renders a clean GRN without app chrome
- The "Print GRN" link on the receipt detail page opens it in a new tab
- Company name comes from `tenant.name`
- Lines show component name, SKU, expected, delivered, variance, cost/unit, line total, batch #, note
- Total received value appears when at least one line has a cost, is omitted otherwise
- Variance is `—` when no expected quantity; otherwise `+N` / `−N` / `0`
- Browser print dialog produces a clean document (no print button visible)
- `npx tsc --noEmit` passes with no errors
