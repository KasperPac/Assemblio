# Design: Goods Inwards PO Linking (F-01 + F-02)

**Date:** 2026-06-01  
**Status:** Approved  
**Source:** Goods Inwards feature review findings F-01 and F-02

---

## Problem

Two related gaps leave the Goods Inwards PO reconciliation workflow completely non-functional:

- **F-01:** `linkReceiptToPo()` server action is fully implemented but no UI exposes it. Every receipt stays `status = 'unmatched'` indefinitely; the filter tabs, variance column, and status badges are decorative.
- **F-02:** `createDeliveryReceipt()` accepts `purchase_order_id` but the new receipt form never sends it. Users cannot create a PO-linked receipt from the UI.

Both are pure UI wiring problems — the server-side logic is complete and correct.

---

## Scope

Wire up the existing server actions to UI. No new server actions, no DB migrations, no new routes.

---

## Design

### 1. New Receipt Form — PO Banner (F-02)

A **"Link to Purchase Order (optional)"** banner sits at the very top of `receipt-form.tsx`, above all other fields.

**Structure:**
- A styled section with a PO `<select>` dropdown and helper text: *"Fills supplier, lines & quantities automatically"*
- Dropdown options sourced from open/in-transit POs, labelled as `PO-0042 · Acme Corp · 3 lines`
- A hidden `<input name="purchase_order_id">` field carries the selected PO ID on submit

**When a PO is selected (client-side state change):**
1. The **Supplier** field auto-fills from the selected PO's supplier and becomes read-only (greyed out)
2. The **lines table** is replaced with rows pre-populated from the PO's lines:
   - One row per PO line
   - `quantity_expected` shown as a read-only column (new column, only appears when PO is selected)
   - `quantity_delivered` pre-filled to match `quantity_expected`, remains editable
3. The **Stock-in reason** field hides (PO provides context; `createDeliveryReceipt()` ignores it when `purchase_order_id` is present)
4. User may still **add extra lines** beyond the PO lines for items not on the PO

**When PO selection is cleared:**
- Supplier field returns to editable
- Pre-filled lines are removed; any manually added extra lines are also cleared (acceptable — clearing the PO is an intentional reset)

**Data sourcing:**
- `new/page.tsx` fetches open/in-transit POs server-side and passes them as a prop to `ReceiptForm`
- No client-side fetching required

---

### 2. Receipt Detail — Amber Link Banner (F-01)

When `receipt.status === 'unmatched'`, an amber warning banner is rendered between the header card and the lines table in `receipt-detail.tsx`.

**Structure:**
```
⚠  This receipt isn't linked to a PO
   [Select a purchase order ▾]  [Link PO]
   Showing open and in-transit POs for Acme Corp
```

The banner contains a `<form action={linkReceiptToPo}>` with:
- `<input type="hidden" name="receipt_id" value={receipt.id} />`
- `<select name="purchase_order_id">` — the PO picker
- A submit button labelled **"Link PO"**

**PO filtering:**
- Filtered to open/in-transit POs for the receipt's `supplier_id`
- If receipt has `supplier_name_override` (no system supplier), show all open/in-transit POs unfiltered

**After submission:**
- `linkReceiptToPo()` calculates variances, updates status to `po_linked` or `discrepancy`, optionally auto-closes the PO, and redirects back to the detail page
- On redirect, `status` is no longer `unmatched` → banner does not render
- Lines table now shows populated `quantity_expected` values

**Error handling:**
- If `linkReceiptToPo()` returns `{ error }` (PO has no lines, already linked, etc.), the banner remains visible and renders the error message below the dropdown

**Banner visibility:** Only rendered when `status === 'unmatched'`. Never shown for `po_linked` or `discrepancy`.

**Data sourcing:**
- `[id]/page.tsx` fetches open/in-transit POs for the receipt's supplier and passes them as a prop to `ReceiptDetail`

---

### 3. Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| PO has no open lines | `linkReceiptToPo()` returns `{ error }`, banner shows error message |
| Receipt has `supplier_name_override` | PO dropdown shows all open/in-transit POs (can't filter by supplier ID) |
| PO line's component not on receipt | `linkReceiptToPo()` still succeeds; those PO lines show zero delivered / full short variance |
| No open POs exist for the supplier | PO dropdown shows empty with placeholder "No open POs for this supplier" |

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/app/goods-inwards/new/page.tsx` | Fetch open/in-transit POs; pass as `availablePOs` prop to `ReceiptForm` |
| `src/app/app/goods-inwards/receipt-form.tsx` | Add PO banner; client state for PO selection; auto-fill supplier + swap lines; hidden `purchase_order_id` field; conditional `quantity_expected` column |
| `src/app/app/goods-inwards/[id]/page.tsx` | Fetch open/in-transit POs for receipt's supplier; pass as `availablePOs` prop to `ReceiptDetail` |
| `src/app/app/goods-inwards/receipt-detail.tsx` | Add amber banner (conditional on `status === 'unmatched'`); form calling `linkReceiptToPo`; error display |

**No changes to:** `actions.ts`, `helpers.ts`, `component-picker.tsx`, `receipt-list.tsx`, DB schema, or routes.

---

## PO Query

Both page.tsx files need open/in-transit POs. Query shape:

```ts
supabase
  .from('purchase_order')
  .select('id, supplier_id, suppliers(name), purchase_order_line(id, component_id, quantity, quantity_received)')
  .in('status', ['open', 'in_transit'])
  .eq('tenant_id', tenantId)
  // For receipt detail: add .eq('supplier_id', receipt.supplier_id) when supplier_id is not null
```

The dropdown label is built from: `PO-{id.slice(0,8).toUpperCase()} · {supplier name} · {line count} lines`.

---

## Out of Scope

- **A-01** ("Receive Goods" shortcut from PO detail) — separate brainstorm session; requires the purchasing module to gain a PO detail page first
- **F-03–F-05** (deep links between PO↔receipts and supplier↔receipts) — separate brainstorm sessions
