# Architecture — Assemblio

## System overview
Assemblio = Shopify (catalog + orders + locations) + Supabase (core domain engine).

Shopify provides:
- Products / Variants
- Orders / Order lifecycle events
- Locations (mapping)

Supabase provides:
- Components + balances
- BOM definitions
- Allocation engine
- Stocktake engine
- Purchasing engine
- Audit/event logs

## Key rule
**All inventory truth and availability lives in Supabase.**
Shopify inventory is informational only.

---

## Core domain boundaries

### Catalog boundary
- `shopify_product`, `shopify_variant` represent Shopify catalog snapshots
- Assemblio attaches BOMs to `shopify_variant`

### Inventory boundary
- `component` is the stocked unit
- `inventory_balance` is authoritative for current totals per component + location
- `inventory_movement` is append-only ledger of changes

Invariant:
- every balance change MUST have a movement record

### Orders boundary
- `order` is local representation of Shopify order
- `order_line` are local order lines mapping to Shopify variants
- `order_component_allocation` tracks reserved component quantities per order

### Stocktake boundary
- `stocktake_session` groups a stocktake event
- `stocktake_line` tracks counted quantity and variance per component (+ location)

### Purchasing boundary
- `purchase_order`, `purchase_order_line`, `suppliers`
- receiving increases on_hand via movements

---

## Data flow diagrams (logical)

### 1) Shopify order -> allocations
Shopify webhook -> Assemblio API endpoint
-> upsert order + lines
-> compute allocations from BOM
-> write allocations
-> write movements (RESERVE)
-> update balances (reserved increases)

### 2) Cancel/refund -> release allocations
Shopify webhook -> Assemblio API endpoint
-> mark order status
-> release allocations
-> write movements (RELEASE)
-> update balances (reserved decreases)

### 3) Stocktake apply
UI/API -> create session + lines
-> apply variances
-> write movements (ADJUST)
-> update balances (on_hand becomes counted)

### 4) Purchase order receive
UI/API -> receive PO
-> write movements (RECEIVE)
-> update balances (on_hand increases)

---

## Idempotency + reliability

### Webhooks must be idempotent
- Use `event_log` (or similar) to store processed webhook IDs.
- For each webhook request:
  1) verify HMAC
  2) compute idempotency key (topic + shop + webhook_id/order_id + payload hash)
  3) if already processed: return 200
  4) else: process transactionally and record key

### Transactionality
Balance updates + movement + allocations must be committed together.
Use Postgres transaction boundaries or single RPC functions for mutation groups.
Ensure retries won’t double-apply (idempotency keys).

---

## Multi-tenancy enforcement
All queries filter by tenant context derived from JWT.
Never accept tenant_id from client for writes without server verification.

---

## What Codex should NOT do
- Don’t add Shopify inventory writes
- Don’t change the movement/balance invariant
- Don’t bypass tenant enforcement
- Don’t invent fields: use schema export
