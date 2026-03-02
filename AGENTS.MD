# AGENTS.md — Assemblio (Codex Source of Truth)

Assemblio is a multi-tenant Shopify-connected BOM + component inventory system.
It ingests Shopify catalog + orders, then performs all BOM availability, allocations,
stocktakes, purchasing, and movement logging in Supabase.

## Canonical backend contracts (DO NOT GUESS)
- Supabase schema: `supabase/schema.sql`
- Supabase SQL patches: `supabase/patches/*.sql`

Codex MUST:
- read these files before implementing features
- never invent table fields
- implement according to schema contract, or update docs + ADR

---

## Inventory policy (LOCKED DECISION)
- **Supabase is the source of truth** for inventory balances and availability.
- Assemblio **does NOT** adjust Shopify inventory levels (no Shopify writes).
- Shopify inventory can be displayed for reference only, but does NOT drive availability.

All inventory changes must be represented by:
1) an append-only `inventory_movement` record
2) an updated `inventory_balance` record (derived/maintained)

Never mutate `inventory_balance` without also writing `inventory_movement`.

---

## Tenancy policy (LOCKED)
Assemblio is multi-tenant.

Rules:
- Every domain write/read is constrained by `tenant_id`
- Never trust tenant_id from client input
- Tenant context is derived from authenticated user session (JWT) and/or server-side mapping

**Testing/fixtures must use tenant:** `Pac-Technologies`
**Never use tenant:** `Fabulous`

---

## What Assemblio does (feature map)

### Shopify ingestion
- Stores store connection + tokens (`shopify_store`, `shopify_install_tokens`)
- Imports products/variants into local tables (`shopify_product`, `shopify_variant`)
- Receives webhooks for orders and order lifecycle
- Maps Shopify locations to local `location`

### BOM management
- Define BOMs per Shopify Variant (`product_bom`)
- Define BOM lines (`product_bom_component`) mapping to `component`
- BOMs are versioned; only one active BOM per variant at a time

### Inventory management
- `component` is the atomic stocked unit
- Balance is tracked per (component_id, location_id) in `inventory_balance`
- Changes are logged in `inventory_movement`
- Component grouping supported (`component_group`)

### Allocation engine
- Shopify order creates local `order` + `order_line`
- For each order line variant, load active BOM and reserve required component quantities
- Reservations are stored in `order_component_allocation`
- Availability uses: available = on_hand - reserved

### Stocktake
- Sessions in `stocktake_session`
- Lines in `stocktake_line`
- Applying a stocktake creates movement logs and updates balances

### Purchasing
- Suppliers: `suppliers`
- POs: `purchase_order`, `purchase_order_line`
- Receiving creates movements and updates balances

### Audit / Observability
- `activity_log` and `event_log` store event traces
- Webhook processing must be idempotent

---

## Codex working rules (non-negotiables)

### Before coding
1) Read the relevant schema in `supabase/schema.sql`
2) Read relevant SQL patches in `supabase/patches/*.sql`
3) Propose a plan (bullets) if non-trivial
4) Implement incrementally with tests

### Stop-and-ask triggers
Ask before:
- changing tenant enforcement
- changing inventory movement semantics
- adding Shopify write scopes or any Shopify inventory writes
- changing webhook topics/verification method
- schema changes / migrations
- adding a new datastore besides Supabase

### Testing requirements (minimum)
- Unit tests for allocation math + rollups
- Idempotency tests for webhook handlers
- Balance/movement invariants tests (movement always accompanies balance update)

---

## Naming conventions
- Use table names as they exist in Supabase
- Use “variant” to mean Shopify variant (`shopify_variant`)
- Use “component” to mean Assemblio component (`component`)
- Use “BOM” to mean `product_bom` + `product_bom_component`

---

## Locked allocation rules
- Allocation location = tenant default location (no splitting)
- Reservation movements use negative deltas in `inventory_movement`

## CLI / scripts (optional)
If you add scripts, keep them in `/scripts` and make them non-interactive by default.
