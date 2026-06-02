# Design: Goods Inwards Navigation Deep-Links

**Date:** 2026-06-03  
**Status:** Approved  
**Covers:** F-03, F-04, F-05 (plus supplier-tab PO ref link as bonus)

---

## Goal

Wire up three missing navigation links between the PO detail page, supplier detail tabs, and receipt detail page. All data already exists; this is purely a presentation layer change.

---

## Scope

| Finding | Description |
|---------|-------------|
| F-03 | PO detail page → show receipts received against it |
| F-04 | Supplier detail PO tab → receipt date links to receipt detail; PO ref links to PO detail |
| F-05 | Receipt detail view mode → "Purchase Order" field links back to the PO |

No DB migrations. No new components. No new CSS files (one new CSS class in `goods-inwards.module.css`).

---

## F-03 — Receipts card on PO detail page

### Data

`purchasing/[id]/page.tsx` adds a second Supabase query inside the existing `Promise.all` (or a separate `await`):

```ts
supabase
  .from("delivery_receipt")
  .select("id, supplier_reference, received_at, status")
  .eq("purchase_order_id", id)
  .eq("tenant_id", tenantId)
  .order("received_at", { ascending: false })
```

Result typed as:
```ts
type ReceiptRow = {
  id: string;
  supplier_reference: string;
  received_at: string;
  status: string;
};
```

Passed as `receipts: ReceiptRow[]` prop to the page JSX (this is a server component — no prop drilling needed, just used inline).

### UI

A new `formCard` rendered below the Lines card:

- **Heading:** `"Receipts"` (same `<h2>` style as the Lines card heading)
- **Empty state:** `<p className={styles.meta}>No deliveries recorded against this PO yet.</p>`
- **When receipts exist:** a `linesTable` (composing from the existing CSS class on the page) with three columns:

| Column | Content |
|--------|---------|
| Docket | `supplier_reference` as `<Link href="/app/goods-inwards/{id}">` |
| Received | `received_at` formatted `d MMM yyyy` (en-AU) |
| Status | `<StatusBadge variant={...}>` using the same `getStatusVariant` helper from `goods-inwards/helpers.ts` — mapping `unmatched → default`, `po_linked → success`, `discrepancy → warning` |

The `getStatusVariant` mapping for receipt status differs from PO status — define an inline helper or a small local function in the page file rather than adding to `status-utils.ts` (which is purchasing-specific).

---

## F-04 — Supplier tabs: link PO ref and receipt date

### Data change

`suppliers/[supplierId]/page.tsx` — change the delivery_receipt sub-select:

```ts
// Before
delivery_receipt(received_at)

// After
delivery_receipt(id, received_at)
```

Update the local `PoRow` type in `page.tsx`:

```ts
delivery_receipt: Array<{ id: string; received_at: string }>;
```

### UI change in `supplier-tabs.tsx`

1. Add `import Link from "next/link"` at the top.

2. Update `PoRow.delivery_receipt` type to add `id: string`.

3. **PO Ref column** — wrap the existing `<span>` in a `<Link>`:
   ```tsx
   // Before
   <span className={styles.poRef}>{po.id.slice(0, 8).toUpperCase()}</span>
   
   // After
   <Link href={`/app/purchasing/${po.id}`} className={styles.poRef}>
     {po.id.slice(0, 8).toUpperCase()}
   </Link>
   ```
   The existing `poRef` class currently sets `color: var(--ink-muted)`. Since this element is used only on the PO ref span (now becoming a link), update `poRef` directly: replace `color: var(--ink-muted)` with `color: var(--brand-1)` and add `text-decoration: none;` plus a `:hover { text-decoration: underline; }` rule.

4. **Received column** — wrap the date in a `<Link>` when `latestReceipt` exists:
   ```tsx
   // Before
   {latestReceipt
     ? new Date(latestReceipt.received_at).toLocaleDateString(...)
     : "—"}
   
   // After
   {latestReceipt ? (
     <Link
       href={`/app/goods-inwards/${latestReceipt.id}`}
       className={styles.receiptLink}
     >
       {new Date(latestReceipt.received_at).toLocaleDateString("en-AU", {
         day: "numeric", month: "short", year: "numeric",
       })}
     </Link>
   ) : "—"}
   ```
   New CSS class `receiptLink` in `supplier-tabs.module.css`: `color: var(--brand-1); text-decoration: none;` with `:hover { text-decoration: underline; }`.

Note: Only the **latest** receipt is surfaced here (existing behaviour). This is intentional — the supplier tab is a summary view; the full receipt list is accessible via the linked receipt or the Goods Inwards index.

---

## F-05 — "View PO" link on receipt detail

### Data change

None. `purchase_order_id: string | null` is already in the `Receipt` type.

### UI change in `receipt-detail.tsx`

1. Add `import Link from "next/link"` at the top.

2. In the **view-mode** `formGrid` section (the block that shows Location, optional Reason, optional Notes), add a new field after the Location field:

   ```tsx
   {receipt.purchase_order_id && (
     <div className={styles.field}>
       <label>Purchase Order</label>
       <Link
         href={`/app/purchasing/${receipt.purchase_order_id}`}
         className={styles.poLink}
       >
         PO-{receipt.purchase_order_id.slice(0, 8).toUpperCase()} →
       </Link>
     </div>
   )}
   ```

3. Add `poLink` to `goods-inwards.module.css`:
   ```css
   .poLink {
     font-size: var(--fs-sm);
     color: var(--brand-1);
     text-decoration: none;
   }
   .poLink:hover {
     text-decoration: underline;
   }
   ```

The field appears only in **view mode** (not inside the edit form). The edit form already conditionally hides `stock_in_reason` when `purchase_order_id` is set — this label appears in the same grid but is read-only, so no editing behaviour needed.

---

## Files changed

| File | Type of change |
|------|----------------|
| `src/app/app/purchasing/[id]/page.tsx` | Add receipts query; render Receipts card |
| `src/app/app/suppliers/[supplierId]/page.tsx` | Add `id` to delivery_receipt select; update PoRow type |
| `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx` | Import Link; add `id` to PoRow type; link PO ref + receipt date |
| `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css` | Update `.poRef` (color + hover); add `.receiptLink` |
| `src/app/app/goods-inwards/receipt-detail.tsx` | Import Link; add PO link field in view-mode formGrid |
| `src/app/app/goods-inwards/goods-inwards.module.css` | Add `.poLink` |

---

## Success criteria

- Navigating to a PO detail page shows a Receipts card listing all linked delivery receipts with working links to each.
- Navigating to a supplier's Purchase Orders tab shows clickable PO refs (→ PO detail) and clickable received dates (→ receipt detail).
- Opening a receipt with `status = 'po_linked'` or `'discrepancy'` shows a "Purchase Order" field in the info card with a working link to the PO.
- Receipts with `status = 'unmatched'` (no `purchase_order_id`) do not show the Purchase Order field.
- `npx tsc --noEmit` passes with no errors after all changes.
