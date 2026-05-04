# Goods Inwards Redesign — Design Spec

**Date:** 2026-05-04
**Author:** Kasper Simonsen (with Claude)
**Status:** Approved — ready for implementation plan

---

## 1. Purpose

Replace the current PO-led receiving flow with a **Delivery Receipt** model — a record of what physically arrived, independent of whether a purchase order is known or linked at the time of receipt.

The redesign addresses three core problems with the existing implementation:

1. Receiving requires knowing the PO upfront — floor staff rarely do.
2. There is no formal record of the delivery itself (docket reference, supplier, what arrived vs what was expected).
3. Non-PO stock-in (samples, customer returns, opening stock) has no flow.

---

## 2. Context

- **Product:** Assemblio — Shopify-native MRP, AU/NZ market, pre-launch SaaS
- **Beta customer state:** No existing SOP for goods inwards. Deliveries arrive with a packing slip or docket (sometimes an invoice). The office processes the paperwork; floor staff may physically count stock but don't operate the system.
- **Existing foundation:**
  - `purchase_order` / `purchase_order_line` — remain as-is; PO completion logic moves to receipt-driven triggers
  - `inventory_movement` / `inventory_balance` / `apply_inventory_movement` RPC — untouched; still the write path for all stock movements
  - `receive_purchase_order` / `receive_purchase_order_line` RPCs — retired once new flow is live
  - `activity_log` — continues to record receipt events

---

## 3. MVP Scope

**In scope:**
- New `delivery_receipt` and `delivery_receipt_line` tables
- Receipt entry form (header + lines, PO link optional)
- PO-linked receiving with expected vs delivered variance display
- Non-PO stock-in with reason codes
- Post-save PO linking from the receipt detail view
- Discrepancy flagging (non-blocking)
- PO auto-completion when all lines fully received
- Retire existing goods inwards page and old receive RPCs

**Explicitly post-MVP:**
- Printable/PDF GRN document
- Barcode scanning on receipt lines
- Multi-delivery consolidation (one PO, multiple receipts across weeks)
- Supplier performance metrics (delivery accuracy, lead time variance)
- 3-way match (PO ↔ receipt ↔ supplier invoice)
- Expiry date / lot / batch capture on receipt lines
- Mobile-optimised warehouse receive UI

---

## 4. Architecture

### 4.1 New tables

**`delivery_receipt`**

```sql
create table public.delivery_receipt (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant(id),
  supplier_id           uuid references public.supplier(id),
  supplier_name_override text,                          -- free-text if supplier not in system
  supplier_reference    text not null,                  -- docket / packing slip number
  purchase_order_id     uuid references public.purchase_order(id),
  location_id           uuid not null references public.location(id),
  received_at           timestamptz not null default now(),
  notes                 text,
  stock_in_reason       text check (stock_in_reason in (
                          'supplier_delivery', 'customer_return', 'opening_stock',
                          'sample', 'adjustment', 'other'
                        )),                              -- required when no PO linked; hidden (supplier_delivery) when PO linked
  status                text not null default 'unmatched'
                          check (status in ('unmatched', 'po_linked', 'discrepancy')),
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now()
);
```

Constraint: `supplier_id` or `supplier_name_override` must be non-null (enforced at app layer). `stock_in_reason` must be non-null when `purchase_order_id` is null (also enforced at app layer — DB allows null to keep the DDL simple).

**`delivery_receipt_line`**

```sql
create table public.delivery_receipt_line (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenant(id),
  delivery_receipt_id      uuid not null references public.delivery_receipt(id) on delete cascade,
  component_id             uuid not null references public.component(id),
  purchase_order_line_id   uuid references public.purchase_order_line(id),
  quantity_delivered       numeric not null check (quantity_delivered > 0),
  quantity_expected        numeric,                     -- populated from PO line when linked
  notes                    text,
  created_at               timestamptz not null default now()
);
```

### 4.2 Inventory write path

On receipt save, for each `delivery_receipt_line`:

```
apply_inventory_movement(
  component_id    = line.component_id,
  location_id     = receipt.location_id,
  delta_on_hand   = line.quantity_delivered,
  delta_in_prod   = 0,
  reason          = 'delivery_receipt',
  reference_type  = 'delivery_receipt',
  reference_id    = receipt.id
)
```

The existing `apply_inventory_movement` RPC is called unchanged. A new `receive_delivery_receipt` RPC wraps this loop atomically.

### 4.3 PO line linkage and completion

When `delivery_receipt_line.purchase_order_line_id` is set, the save RPC increments `purchase_order_line.quantity_received` by `quantity_delivered` (capped at remaining outstanding).

After processing all lines, the RPC checks whether all lines on the linked PO have `quantity_received >= quantity`. If so, `purchase_order.status` is set to `received`.

### 4.4 Receipt status computation

Computed and written to `delivery_receipt.status` on save and on re-link:

| Condition | Status |
|---|---|
| No `purchase_order_id` | `unmatched` |
| PO linked, all lines exact or over | `po_linked` |
| PO linked, any line short | `discrepancy` |

Over-deliveries also set `discrepancy` (excess went to inventory; office should review).

### 4.5 Retiring old RPCs

`receive_purchase_order` and `receive_purchase_order_line` are dropped once the new flow is live. The old goods inwards page and its server actions are removed.

---

## 5. UI Structure

### 5.1 Navigation

Route stays at `/app/goods-inwards`. Page title changes to **Goods Inwards** (unchanged externally). Subtitle updates to "Record deliveries and receipt stock into inventory."

### 5.2 Receipt list (main page)

Table of delivery receipts, most recent first.

Columns:

| Column | Source |
|---|---|
| Supplier | `supplier.name` or `supplier_name_override` |
| Reference | `delivery_receipt.supplier_reference` |
| Lines | count of `delivery_receipt_line` |
| Received | `delivery_receipt.received_at` |
| Location | `location.name` |
| PO | `purchase_order` number if linked, else — |
| Status | `unmatched` / `po_linked` / `discrepancy` badge |

Filter tabs: **All · Unmatched · Discrepancy · This Week**

**"New Receipt"** button (primary, top right) opens the entry form.

### 5.3 Receipt entry form

**Header fields:**

| Field | Type | Notes |
|---|---|---|
| Supplier | Searchable dropdown | Existing suppliers; "Other / not in system" fallback reveals `supplier_name_override` text input |
| Supplier reference | Text input | Required. Docket / packing slip number |
| Date received | Date picker | Defaults to today |
| Location | Dropdown | All active locations; not hardwired to default |
| Link to PO | Searchable dropdown | Optional. Filters open POs by selected supplier. When selected, pre-fills expected quantities on matching lines |
| Reason | Dropdown | Hidden when PO is linked. Required when no PO: Supplier delivery / Customer return / Opening stock / Sample / Adjustment / Other |
| Notes | Textarea | Optional. Receipt-level notes |

**Lines table:**

| Column | Notes |
|---|---|
| Component | Searchable dropdown. When PO is linked, auto-populates lines from PO; additional lines can be added manually |
| Expected | Read-only. Populated from PO line remaining qty. Blank if no PO |
| Delivered | Number input. Required |
| Variance | Auto-calculated (Delivered − Expected). Red highlight if negative, orange if positive (over-delivery) |
| Note | Short text. Damage, substitution, etc. |
| ✕ | Remove line |

**"+ Add line"** adds a blank row. **"Save Receipt"** submits — inventory moves immediately.

### 5.4 Receipt detail view

Read-only summary after save. Shows all header fields, each line with expected / delivered / variance, linked PO (if any), created by, and timestamp. Serves as the GRN record the office can file.

**"Link to PO"** button — available when receipt is `unmatched`. Opens a modal with a searchable list of open POs filtered by supplier. Selecting a PO auto-matches lines by component, populates expected quantities, recalculates variances, updates `purchase_order_line.quantity_received`, and re-computes receipt status.

**"Edit"** button — allows correcting header fields and line notes only. Delivered quantities are locked after save (inventory already moved). Corrections to delivered quantity require a separate adjustment receipt.

---

## 6. Discrepancy handling

Discrepancies are **non-blocking** — inventory moves for whatever was delivered, regardless of variance. The `discrepancy` status flag is informational.

| Variance | Status | UI treatment |
|---|---|---|
| Delivered = expected | Exact | No highlight |
| Delivered < expected | Short | Red variance; PO line stays open for future receipt |
| Delivered > expected | Over | Orange variance; excess in inventory; office reviews |

The per-line note field is where the receiver records context (e.g. "3 units damaged", "supplier sent wrong SKU"). No automated supplier chase is triggered in MVP — that is a post-MVP feature.

---

## 7. Data flow summary

```
Delivery arrives with packing slip
  → Office creates delivery receipt
  → Optionally links to open PO (reference on docket)
  → Enters lines: component + quantity delivered + notes
  → Saves

receive_delivery_receipt RPC (atomic)
  → For each line: apply_inventory_movement → inventory_balance updated
  → For each linked PO line: purchase_order_line.quantity_received incremented
  → PO status → 'received' if all lines complete
  → delivery_receipt.status computed and written
  → activity_log event recorded

Receipt detail view
  → Read-only GRN record
  → "Link to PO" available if unmatched
```

---

## 8. Out of scope (this spec)

- Printable / PDF GRN export
- Barcode scanning
- Expiry date, lot, and batch capture on receipt lines
- Supplier performance tracking (delivery accuracy, lead time)
- 3-way match (PO ↔ receipt ↔ supplier invoice)
- Mobile warehouse UI
- Multi-currency (AUD only)

---

## 9. Acceptance criteria

1. A delivery receipt can be saved with no PO linked — inventory moves correctly and receipt shows as `unmatched`.
2. A delivery receipt linked to a PO at save time populates expected quantities, computes variances, and updates `purchase_order_line.quantity_received`.
3. A PO whose lines are all fully received auto-closes to `received` status.
4. An `unmatched` receipt can be linked to a PO from the detail view after save — PO lines update correctly.
5. A short delivery (delivered < expected) sets receipt status to `discrepancy` and leaves the PO line open.
6. An over-delivery sets receipt status to `discrepancy` but still moves full delivered quantity to inventory.
7. Non-PO receipts require a reason code and move inventory correctly.
8. Location is selectable per receipt — not hardwired to the tenant default.
9. The existing `receive_purchase_order` and `receive_purchase_order_line` RPCs are retired and the old receive flow is removed.
10. All inventory writes go through `apply_inventory_movement` — no direct balance updates.
