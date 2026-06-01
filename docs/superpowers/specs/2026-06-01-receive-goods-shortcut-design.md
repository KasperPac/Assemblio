# Design: "Receive Goods" Shortcut from PO Detail (A-01)

**Date:** 2026-06-01  
**Status:** Approved  
**Source:** Goods Inwards feature review finding A-01

---

## Problem

Users who work from the purchasing side of the app (POs first, receipts second) have no shortcut to initiate a goods receipt from a PO. They must navigate to Goods Inwards, open the new receipt form, then manually select the PO from the dropdown. The "Receive Goods" flow should start on the PO, not in Goods Inwards.

Additionally, the purchasing module has no PO detail page — POs are listed on a single page with no drill-down.

---

## Scope

Four files. No new server actions, no DB migrations, no new routes beyond the PO detail page itself.

---

## Design

### 1. PO Detail Page — `purchasing/[id]/page.tsx` (new file)

A pure server component. Fetches the PO with its lines and supplier, renders:

**Header card:**
- PO reference: `PO-{id.slice(0, 8).toUpperCase()}`
- Supplier name (from join)
- Status badge
- Created date (formatted)
- **"Receive Goods →"** `<Link>` to `/app/goods-inwards/new?po={id}` — only rendered when `status === 'open' || status === 'in_transit'`. Not shown for `received`, `cancelled`, or `archived`.

**Lines table:**

| Component | Ordered | Received | Outstanding |
|-----------|---------|----------|-------------|
| Widget A (WGT-001) | 50 | 12 | 38 |
| Bracket B (BKT-002) | 20 | 0 | 20 |

- Outstanding = `quantity − quantity_received`, shown as `—` when zero
- Rows where outstanding = 0 are rendered at reduced opacity (fully received)

**Footer:** `← Back to purchase orders` link to `/app/purchasing`

**Status update stays on the list page.** The detail page is read-only. Status editing can be added to the detail page when F-03 (PO → receipts section) is built.

---

### 2. PO List — clickable PO number

In `purchasing/page.tsx`, the `<strong>PO-{row.id.slice(0,6)}</strong>` in each list row becomes:

```tsx
<Link href={`/app/purchasing/${row.id}`}>PO-{row.id.slice(0, 6)}</Link>
```

(The slice length stays at 6 to match the existing list — the detail page header uses 8 since it's new.)

No other changes to the list page.

---

### 3. Receipt Form Pre-selection

**`goods-inwards/new/page.tsx`**

Accepts `searchParams: Promise<{ po?: string }>` (Next.js 15 App Router pattern). Reads the `po` param and passes it as `initialPoId` to `<ReceiptForm>`.

**`goods-inwards/receipt-form.tsx`**

Adds `initialPoId?: string` to props. State is initialized lazily so there is no post-mount flash:

```typescript
// Find the PO in the already-fetched availablePOs list
const initialPo = initialPoId
  ? availablePOs.find((p) => p.id === initialPoId) ?? null
  : null;

// selectedPoId, supplierId, and lines all initialize from initialPo if present
const [selectedPoId, setSelectedPoId] = useState<string>(initialPo?.id ?? "");
const [supplierId, setSupplierId] = useState<string>(
  initialPo?.supplier_id ?? ""
);
const [lines, setLines] = useState<LineState[]>(() => {
  if (!initialPo) return [blankLine()];
  const poLines = initialPo.lines
    .filter((l) => l.quantity - l.quantity_received > 0)
    .map((l) => {
      const remaining = l.quantity - l.quantity_received;
      return {
        key: crypto.randomUUID(),
        component_id: l.component_id,
        quantity_delivered: String(remaining),
        cost_per_unit: "",
        notes: "",
        quantity_expected: remaining,
        purchase_order_line_id: l.id,
      };
    });
  return poLines.length > 0 ? poLines : [blankLine()];
});
```

**Graceful fallback:** If `initialPoId` is provided but not found in `availablePOs` (PO already received, stale link, wrong tenant), `initialPo` is `null` and the form loads normally with no pre-selection.

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/app/purchasing/page.tsx` | PO number cell → `<Link href="/app/purchasing/{id}">` |
| `src/app/app/purchasing/[id]/page.tsx` | **New** — PO detail server component |
| `src/app/app/goods-inwards/new/page.tsx` | Accept `searchParams`, pass `initialPoId` to `ReceiptForm` |
| `src/app/app/goods-inwards/receipt-form.tsx` | Accept `initialPoId`, lazy-init state |

**No changes to:** `actions.ts`, `receipt-detail.tsx`, `receipt-list.tsx`, DB schema, or any other routes.

---

## PO Detail Query

```ts
supabase
  .from("purchase_order")
  .select(
    `id, supplier_id, status, created_at,
     suppliers(name),
     purchase_order_line(id, component_id, quantity, quantity_received,
       component:component_id(name, sku))`
  )
  .eq("id", id)
  .eq("tenant_id", tenantId)
  .single()
```

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| PO status is `received` / `cancelled` / `archived` | "Receive Goods" CTA not rendered on detail page |
| User navigates directly to `/goods-inwards/new?po=<id>` with a received/cancelled PO id | `initialPo` is `null` (not in `availablePOs`); form loads normally, no pre-selection |
| PO has all lines fully received (`outstanding = 0` on all lines) | CTA hidden (status would be `received`); even if not, form falls back to `[blankLine()]` |
| PO belongs to different tenant | Not found by `.eq("tenant_id", tenantId)` → `notFound()` |

---

## Out of Scope

- Status update on the detail page (stays on list; moves when F-03 is built)
- Receipts tab/section on the detail page (F-03)
- Supplier deep-links (F-04)
