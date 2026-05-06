# Suppliers Module Redesign

**Date:** 2026-05-06  
**Status:** Approved

## Overview

The current suppliers module stores only a supplier name and exposes a basic list with inline rename. It has no contact details, no supplier–component catalog, no purchase order association, and no lead time tracking. This spec defines a full vendor management module that scales from small shops (5–20 suppliers) to larger operations (150+).

The design is based on a review of six MRP competitors (Cin7, MRPeasy, Fishbowl, Katana, Unleashed, Odoo), establishing a table-stakes baseline, competitive differentiators, and a future-phases roadmap.

## Scope

### In scope
- Supplier master record (full contact details, terms, lead time, notes)
- Multiple contacts per supplier
- Supplier–component catalog with per-supplier pricing, MOQ, lead time, supplier part number
- Quantity price breaks per supplier–component link
- Default/preferred supplier per component
- Supplier comparison view on the component page (side-by-side across all suppliers for that component, with best-price and fastest tags)
- Actual vs. promised lead time tracking (derived from PO receipt history, displayed per supplier–component row)
- PO history per supplier (list of all POs linked to that supplier with on-time/late indicator per row)
- Archive/deactivate suppliers (soft delete, history preserved)
- Supplier list page with summary columns (component count, default lead time, last PO date, open POs)

### Out of scope (future phases)
- Supplier scorecards (dedicated scorecard UI with configurable KPIs)
- On-time delivery % as a standalone metric
- Price validity windows / date-bounded pricing
- Dynamic lead time learning (auto-update lead time estimates from actuals)
- RFQ / purchase tender workflow
- Multi-supplier sourcing rules (split sourcing)
- Supplier portal (supplier-facing login)
- Quality / reject rate tracking

## Structure — Supplier-Centric Hub (Approach A)

The supplier detail page is the primary hub. Everything about a supplier lives on tabs within that page. The component page cross-links to the same catalog data from the other direction.

No nav restructure required. The existing "Suppliers" nav item is extended. A future "Procurement" rename can absorb RFQ and tender features when those land.

## Data Model

### Extend `suppliers` table

| Column | Type | Notes |
|---|---|---|
| `contact_name` | text | Primary contact name |
| `contact_email` | text | Primary contact email |
| `contact_phone` | text | Primary contact phone |
| `website` | text | Supplier website URL |
| `address` | text | Billing/delivery address |
| `payment_terms` | text | Free text e.g. "Net 30", "COD" |
| `default_currency` | text | ISO code e.g. "AUD", "USD" |
| `default_lead_time_days` | integer | Fallback if no component-specific lead time |
| `notes` | text | Internal notes |
| `is_active` | boolean | Default true; false = archived |

### New `supplier_contacts` table

Additional contacts beyond the primary. Primary contact fields remain on the `suppliers` row for quick access.

| Column | Type |
|---|---|
| `id` | uuid PK |
| `tenant_id` | uuid FK |
| `supplier_id` | uuid FK → suppliers |
| `name` | text |
| `email` | text |
| `phone` | text |
| `role` | text (e.g. "Accounts", "Logistics") |
| `is_primary` | boolean |

### New `supplier_components` table

The catalog linking suppliers to the components they stock.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |
| `tenant_id` | uuid FK |
| `supplier_id` | uuid FK → suppliers |
| `component_id` | uuid FK → components |
| `supplier_part_number` | text | Supplier's own SKU/part code |
| `unit_cost` | numeric | Base unit cost |
| `currency` | text | ISO code; defaults to supplier's default_currency |
| `lead_time_days` | integer | Promised lead time |
| `moq` | numeric | Minimum order quantity |
| `is_preferred` | boolean | Only one preferred per component globally |
| `notes` | text | |

Unique constraint: `(tenant_id, supplier_id, component_id)`.

Actual lead time is derived at runtime by averaging `(received_date - ordered_date)` across received POs for that supplier–component pair. No stored column needed — the data already exists in `purchase_order` and `purchase_order_line`.

### New `supplier_component_price_breaks` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |
| `supplier_component_id` | uuid FK → supplier_components |
| `min_quantity` | numeric | Lower bound of this tier |
| `unit_cost` | numeric | Price at this tier |

Tiers are ordered ascending by `min_quantity`. The applicable price is the highest tier whose `min_quantity` ≤ order quantity. If no tiers exist, `supplier_components.unit_cost` applies.

## Pages

### Supplier List (`/app/suppliers`)

Replaces the current name-only list.

**Columns:** Supplier name + website, component count, default lead time, last PO date, open PO count (badge).

**Filters:** All / Active / Archived tabs. Search by name.

**Actions:** + New Supplier button. Per-row ••• menu: Rename, Archive, Delete (only if no PO history).

Archived suppliers are dimmed. Visible under "All" tab, hidden under "Active" (default).

### Supplier Detail (`/app/suppliers/[supplierId]`)

Three tabs:

#### Overview tab
- Info grid: contact name, email, phone, website, address, payment terms, default currency, default lead time
- Additional contacts section (list + add contact)
- Notes section (free text)
- Edit button (opens inline edit or modal)
- Archive button

#### Components tab
- Search input + **+ Link Component** button
- Table columns: Component name, Supplier Part #, Unit Cost, MOQ, Lead Time (promised), Avg Actual (derived), Preferred star, ••• menu
- Avg Actual shown in green if ≤ promised, red if > promised (shown as — if fewer than 3 received POs)
- Price breaks collapse inline per row (▾ toggle); shown as indented sub-rows when expanded
- Preferred star toggles inline; enforces single preferred per component across all suppliers
- ••• menu: Edit, Remove (unlinks from catalog; does not affect PO history)

#### Purchase Orders tab
- Filter: All / Open / Received
- **+ New PO** button (creates PO pre-linked to this supplier)
- Table columns: PO #, Created date, Status, Expected date, Received date + on-time/late indicator, Value
- On-time indicator: "✓ on time" (green) or "+N days late" (red) on received POs
- Links to PO detail page

### Component Page — Suppliers Tab

Added to the existing component detail page alongside existing tabs.

**Columns:** Supplier name, Supplier Part #, Unit Cost (with price breaks expandable), MOQ, Lead Time (promised), Avg Actual (green/red), Preferred star.

**Auto-tags:** "best price" tag on the lowest unit cost row; "fastest" tag on the shortest lead time row. Tags are derived at render time — no stored field.

**+ Link Supplier** button opens a modal: pick supplier from dropdown, enter part number, unit cost, MOQ, lead time. Saves to `supplier_components`.

Preferred star toggles the same record as toggling from the supplier detail page — single source of truth.

## Behaviour Details

**Preferred supplier enforcement:** Setting a supplier as preferred for a component clears the `is_preferred` flag on all other `supplier_components` rows for that component (within the tenant). This is enforced in the server action, not the DB constraint, to allow a grace period during data entry.

**Avg actual lead time calculation:**
```
avg(received_at - ordered_at) 
WHERE purchase_order.supplier_id = $supplier_id 
  AND purchase_order_line.component_id = $component_id 
  AND purchase_order.status = 'received'
  AND tenant_id = $tenant_id
```
Displayed as "N.N days". If fewer than 3 received POs exist for the pair, show "—" (insufficient data).

**Archive behaviour:** Setting `is_active = false` hides the supplier from the Active list and the "+ Link Supplier" modal dropdown. All existing catalog links and PO history are preserved. Preferred supplier status is cleared on archive.

**Delete behaviour:** Only permitted if the supplier has zero POs. Cascades to `supplier_contacts` and `supplier_components`. Blocked with an error message if POs exist — user must archive instead.

## Future Phases

The following features were identified during brainstorming as differentiators worth building later:

1. **Supplier scorecard** — dedicated UI aggregating OTD %, avg lead time accuracy, purchase volume, price variance
2. **Dynamic lead time learning** — auto-update `lead_time_days` on `supplier_components` based on rolling actual average
3. **RFQ / purchase tender** — send quote requests to multiple suppliers, compare responses, select winner
4. **Multi-supplier sourcing rules** — priority-based or percentage-split auto-sourcing per component
5. **Supplier portal** — supplier-facing login to acknowledge POs and post lead time exceptions
6. **Quality / reject tracking** — log rejected quantity on receipt; track defect rate per supplier
