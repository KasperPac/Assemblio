# Goods Inwards Redesign — Handover

**Branch:** `feature/goods-inwards-redesign`
**Date:** 2026-05-05
**Author:** Kasper Simonsen (with Claude)

---

## What was built

Replaced the PO-led receiving flow with a **Delivery Receipt** model. Previously, receiving stock required knowing the purchase order upfront. Now:

- A delivery receipt records what physically arrived, independent of any PO
- PO linking is optional at save time and can be done from the detail view after the fact
- Non-PO stock-in (samples, customer returns, opening stock, etc.) is fully supported via reason codes
- Discrepancies (short or over delivery) are flagged but non-blocking — inventory always moves for what actually arrived

---

## Routes

| Route | Description |
|---|---|
| `/app/goods-inwards` | Receipt list with filter tabs (All / Unmatched / Discrepancy / This Week) |
| `/app/goods-inwards/new` | New receipt entry form |
| `/app/goods-inwards/[id]` | Receipt detail (read-only GRN) + inline Link to PO |

---

## Files changed

**Database patches (apply via `supabase db reset`):**
- `supabase/patches/delivery_receipt_tables.sql` — new tables + RLS
- `supabase/patches/receive_delivery_receipt_rpc.sql` — atomic receive RPC
- ~~`supabase/patches/receive_purchase_order_rpc.sql`~~ — deleted (retired)
- ~~`supabase/patches/receive_purchase_order_line_rpc.sql`~~ — deleted (retired)

**Server actions + helpers:**
- `src/app/app/goods-inwards/helpers.ts` — `computeReceiptStatus`, `computeVariance` (pure, tested)
- `src/app/app/goods-inwards/actions.ts` — `createDeliveryReceipt`, `linkReceiptToPo`
- `src/app/app/goods-inwards/actions.test.ts` — 9 unit tests (all passing)

**Pages and components:**
- `src/app/app/goods-inwards/page.tsx` — replaced: receipt list server component
- `src/app/app/goods-inwards/receipt-list.tsx` — client component with filter tabs
- `src/app/app/goods-inwards/goods-inwards.module.css` — replaced: new CSS module
- `src/app/app/goods-inwards/new/page.tsx` — new receipt form server component
- `src/app/app/goods-inwards/receipt-form.tsx` — new receipt form client component
- `src/app/app/goods-inwards/[id]/page.tsx` — receipt detail server component
- `src/app/app/goods-inwards/receipt-detail.tsx` — receipt detail client component

**Config:**
- `src/app/app/route-meta.ts` — subtitle updated to "Record deliveries and receipt stock into inventory."

---

## Data model

```
delivery_receipt
  id, tenant_id, supplier_id?, supplier_name_override?,
  supplier_reference (required), purchase_order_id?,
  location_id, received_at, notes?, stock_in_reason?,
  status ('unmatched' | 'po_linked' | 'discrepancy'),
  created_by, created_at

delivery_receipt_line
  id, tenant_id, delivery_receipt_id, component_id,
  purchase_order_line_id?, quantity_delivered,
  quantity_expected?, notes?, created_at
```

**Status rules:**
- `unmatched` — no PO linked
- `po_linked` — PO linked, all delivered quantities match expected
- `discrepancy` — PO linked, any line is short or over

---

## How to deploy

1. Run `supabase db reset` — applies both new patches, removes old RPCs
2. Run `npm run build` — confirms no TypeScript errors
3. Deploy as normal

No data migrations needed — new tables only. Existing PO data is untouched.

---

## Known limitations (post-MVP)

These were explicitly scoped out of this release:

- **Printable / PDF GRN** — detail view is screen-only for now
- **Barcode scanning** on receipt lines
- **Multi-delivery consolidation** — one PO can receive across multiple receipts (data supports it, no consolidation UI)
- **Supplier performance metrics** — delivery accuracy, lead time variance
- **3-way match** — PO ↔ receipt ↔ supplier invoice
- **Expiry date / lot / batch** on receipt lines
- **Mobile warehouse UI**
- **`linkReceiptToPo` atomicity** — the post-save link action fires individual DB updates without a transaction. For MVP this is acceptable; for production load it should be moved to an RPC (same pattern as `receive_delivery_receipt`). Partial failure leaves a warning in the server action return value but does not crash.

---

## Testing checklist

- [ ] Create a non-PO receipt (select "Other / not in system" supplier, pick a reason) → receipt appears in list as `unmatched`, inventory moves
- [ ] Create a PO-linked receipt with exact quantities → status `po_linked`, PO line `quantity_received` incremented
- [ ] Create a PO-linked receipt with short delivery → status `discrepancy`, PO line stays open
- [ ] Create a PO-linked receipt that fully closes all PO lines → PO status flips to `received`
- [ ] Create an unmatched receipt, then use "Link to PO" from the detail view → status updates, PO lines update
- [ ] Filter tabs on the list page work correctly
- [ ] "New Receipt" button and Cancel both navigate correctly
- [ ] 404 returned for `/app/goods-inwards/non-existent-id`
