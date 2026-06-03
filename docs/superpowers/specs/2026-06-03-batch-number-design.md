# Design: A-02 — Lot/Batch Number Capture per Receipt Line

**Date:** 2026-06-03  
**Status:** Approved

---

## Goal

Add an optional `batch_number` text field to `delivery_receipt_line` so warehouse staff can record supplier lot/batch numbers at the time of goods receipt. The field is capture-only — it cannot be edited after the receipt is created.

---

## Scope

- DB migration to add `batch_number text` column
- New input column in the new-receipt form
- Passed through to `createDeliveryReceipt` server action
- Read-only display column in receipt detail (view and edit modes)

No update path. No new CSS file. No new components.

---

## Database

New patch file: `supabase/patches/2026-06-03-delivery-receipt-line-batch-number.sql`

```sql
alter table public.delivery_receipt_line
  add column if not exists batch_number text;
```

Nullable, no length or format constraint — batch number formats vary across suppliers.

---

## Form (`receipt-form.tsx`)

### `LineState` type

Add `batch_number: string` to the type:

```typescript
type LineState = {
  key: string;
  component_id: string;
  quantity_delivered: string;
  cost_per_unit: string;
  notes: string;
  batch_number: string;
  extractedName?: string;
  quantity_expected?: number | null;
  purchase_order_line_id?: string | null;
};
```

### `blankLine()`

Include `batch_number: ""` in the blank line factory:

```typescript
function blankLine(): LineState {
  return {
    key: crypto.randomUUID(),
    component_id: "",
    quantity_delivered: "",
    cost_per_unit: "",
    notes: "",
    batch_number: "",
  };
}
```

### `handlePoSelect`

The PO-prefill function builds `poLines` from PO line data — add `batch_number: ""` to each prefilled line so the type is satisfied.

### Lines table

Add a **Batch #** column between Note and the remove button:

```
| Component | [Expected] | Qty delivered | Cost / unit | Note | Batch # |   |
```

The input:
```tsx
<input
  type="text"
  placeholder="Batch…"
  value={line.batch_number}
  onChange={(e) => updateLine(line.key, { batch_number: e.target.value })}
  style={{ width: 120 }}
/>
```

The column header: `<th>Batch #</th>` (rightmost before the remove `<th></th>`).

### `handleSubmit`

In the JSON serialisation of lines, include `batch_number`:

```typescript
fd.set(
  "lines",
  JSON.stringify(
    filledLines.map((l) => ({
      component_id: l.component_id,
      purchase_order_line_id: l.purchase_order_line_id ?? null,
      quantity_delivered: parseFloat(l.quantity_delivered),
      quantity_expected: l.quantity_expected ?? null,
      cost_per_unit: l.cost_per_unit ? parseFloat(l.cost_per_unit) : null,
      notes: l.notes || null,
      batch_number: l.batch_number || null,
    }))
  )
);
```

---

## Server action (`actions.ts`)

### `createDeliveryReceipt` — line insert

The `lines` array parsed from FormData gains a `batch_number` field. Add it to the insert:

```typescript
lines.map((l) => ({
  tenant_id: tenantId,
  delivery_receipt_id: receipt.id,
  component_id: l.component_id,
  purchase_order_line_id: l.purchase_order_line_id,
  quantity_delivered: l.quantity_delivered,
  quantity_expected: l.quantity_expected,
  cost_per_unit: l.cost_per_unit ?? null,
  notes: l.notes,
  batch_number: l.batch_number ?? null,
}))
```

The parsed line type (inline in the action) must also gain `batch_number?: string | null`.

---

## Detail view (`receipt-detail.tsx`)

### `ReceiptLine` type

Add `batch_number: string | null`:

```typescript
type ReceiptLine = {
  id: string;
  component_id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
  batch_number: string | null;
  component: ...;
};
```

### Supabase query in `[id]/page.tsx`

The detail page selects `delivery_receipt_line(...)`. The current select string must include `batch_number`:

```typescript
delivery_receipt_line(
  id, component_id, quantity_delivered, quantity_expected,
  notes, cost_per_unit, batch_number,
  component:component_id(name, sku, image_url)
)
```

### Lines table

Add a **Batch #** column as the last data column (after Note):

```
| [img] | Component | Expected | Delivered | Variance | Cost / unit | Note | Batch # |
```

Rendering (same in both view and edit mode — never editable):

```tsx
<td>{line.batch_number ?? "—"}</td>
```

Table header: `<th>Batch #</th>`

---

## Files changed

| File | Change |
|------|--------|
| `supabase/patches/2026-06-03-delivery-receipt-line-batch-number.sql` | New migration — add `batch_number text` column |
| `src/app/app/goods-inwards/receipt-form.tsx` | `batch_number` in `LineState` + `blankLine()` + PO prefill + table column + submit serialisation |
| `src/app/app/goods-inwards/actions.ts` | `batch_number` in line insert (parsed line type + insert map) |
| `src/app/app/goods-inwards/[id]/page.tsx` | Add `batch_number` to `delivery_receipt_line` select |
| `src/app/app/goods-inwards/receipt-detail.tsx` | `batch_number` in `ReceiptLine` type + read-only column |

---

## Success criteria

- Creating a receipt with a batch number saves the value to `delivery_receipt_line.batch_number`
- Creating a receipt without a batch number saves `null` (no error)
- The detail page shows "Batch #" column with the value or "—"
- The Batch # column is not an input in edit mode — it is always read-only after creation
- `npx tsc --noEmit` passes with no errors
