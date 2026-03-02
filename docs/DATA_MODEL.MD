# Data Model — Assemblio

Authoritative definition: `supabase/schema.sql`

This document describes responsibilities + expected invariants per table.

## Tenancy / Users
### `tenant`
Represents an organization (e.g., Pac-Technologies).
All domain data attaches to a tenant.

### `profiles`
Maps authenticated users (`auth.users`) to tenant membership and role.

---

## Shopify integration
### `shopify_store`
Shop identity and metadata (shop domain, store name, status).

### `shopify_install_tokens`
Store access tokens per connected store.

### `shopify_product`
Local snapshot of Shopify product.

### `shopify_variant`
Local snapshot of Shopify variant; primary attach point for BOM.

---

## Core inventory
### `component`
A stocked item used in BOMs.
May map to a Shopify variant SKU or may be internal-only (confirm in UI rules).
Supports grouping via `component_group`.

### `component_group`
Grouping and filtering of components.

### `location`
Represents an inventory location. Typically maps to Shopify location.

### `inventory_balance`
Authoritative current totals per (tenant_id, component_id, location_id).
Core fields:
- on_hand
- in_prod
- reserved
- updated_at

Invariant:
- mutations require accompanying `inventory_movement` records.

### `inventory_movement`
Append-only ledger of inventory changes.
Core fields:
- component_id
- location_id
- delta_on_hand
- delta_in_prod
- reason
- reference_type + reference_id (order, stocktake, purchase order)
- created_at

Invariant:
- never edit or delete movements in normal operation (append-only)

---

## BOM
### `product_bom`
Versioned BOM tied to a Shopify variant.
Core fields:
- shopify_variant_id
- version
- is_active
- created_at

Invariant:
- only 1 active BOM per variant at a time.

### `product_bom_component`
BOM lines.
From the workspace data you uploaded earlier, this table includes:
- product_bom_id
- component_id
- quantity_per_unit
- sort_order
- created_at / updated_at

---

## Orders + allocations
### `order`
Local representation of Shopify order.
Holds Shopify order identifiers, statuses, timestamps.

### `order_line`
Local order lines mapping to Shopify variants.
Holds qty ordered, variant_id, etc.

### `order_component_allocation`
Reservations of components for an order (or per order line).
Core fields:
- order_line_id
- component_id
- quantity
- created_at

Invariant:
- allocations drive reserved quantities in balance.

---

## Stocktake
### `stocktake_session`
Header record for a stocktake event (location, status, started/closed).

### `stocktake_line`
Counted lines.
Core fields:
- session_id
- component_id
- counted

Applying a stocktake creates movements and updates balances.

---

## Purchasing
### `suppliers`
Supplier records (lead times, contact, etc).

### `purchase_order`
PO header.

### `purchase_order_line`
PO lines for components.

Receiving creates movements + increases on_hand balance.

---

## Audit / logs
### `activity_log`
Human-facing audit trail.

### `event_log`
System/event-level log; used for webhook idempotency, retries, debugging.
