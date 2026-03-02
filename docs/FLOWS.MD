# Flows — Assemblio (Authoritative Behavior)

Inventory truth: Supabase
Shopify inventory writes: NO

## Shared rules

### Balance & movement invariant (mandatory)
Any change to inventory totals MUST:
1) create `inventory_movement` record(s)
2) update `inventory_balance`

Never update `inventory_balance` without a movement.

### Availability definition
For a given (component_id, location_id):
- available = on_hand - reserved

### BOM buildable quantity
For a Shopify variant at a location:
1) load active `product_bom` for the variant
2) for each BOM line:
   - componentAvailable = inventory_balance.available(component_id, location_id)
   - buildableForLine = floor(componentAvailable / quantity_per_unit)
3) buildable = min(buildableForLine across required lines)

Edge cases:
- no active BOM -> buildable is null/0 (decide UI)
- missing component balance -> treat available as 0

---

## Flow 1 — Shopify install/connect

Goal: connect store, store tokens securely, begin catalog sync.

Steps:
1) begin OAuth install (state/nonce created, stored in `shopify_install_tokens`)
2) Shopify redirects to callback with code + HMAC
3) verify HMAC + state
4) exchange code for access token
5) store token in `shopify_install_tokens`
6) create/activate `shopify_store`
7) register webhooks
8) run initial import:
   - locations -> `location`
   - products/variants -> `shopify_product`, `shopify_variant`
   - (optional) Shopify inventory levels for informational display only

---

## Flow 2 — Catalog import/update

Trigger:
- manual import endpoint (`/products/shopify/import` exists in your API)
- product update webhook

Behavior:
- upsert products/variants by Shopify IDs
- do not modify BOMs on product update
- if variant removed, BOM is retained but flagged (implementation choice)

---

## Flow 3 — Order create/update -> allocations

Trigger:
- Shopify webhook order create/update endpoints

Inputs:
- shopify_order_id
- line items (variant ids, qty)
- location/fulfillment if available

Algorithm (idempotent):
1) compute idempotency key:
   - shop + topic + shopify_order_id + payload_hash
2) if already processed in `event_log`: return 200

3) upsert `order`
4) upsert `order_line` records

### Allocation location rule (LOCKED)
If an incoming Shopify order does not specify an explicit fulfillment location, Assemblio allocates from the tenant’s **default location**.

- Default location is stored/configured per tenant (settings).
- No multi-location splitting in MVP.

6) for each order_line:
   - find `shopify_variant`
   - find active `product_bom` for that variant
   - for each BOM line:
       required = order_line.qty * bom_component.quantity_per_unit

       create/update `order_component_allocation` for (order, component, location)
       deltaReserved = required - existingReserved

       if deltaReserved != 0:
         write `inventory_movement` type = RESERVE with quantity_delta = -deltaReserved? (choose convention)
         update `inventory_balance.reserved += deltaReserved`

IMPORTANT:
- Reserved increases reduce available; on_hand remains unchanged.

7) record processed event in `event_log`
8) return 200

Notes:
- If BOM missing, record in `activity_log` and optionally mark order as “needs BOM”

---

## Flow 4 — Order cancelled/refunded -> release allocations

Trigger:
- Shopify cancel webhook endpoint (exists)
- Refund webhook endpoint (if implemented; if not, document as future)

Behavior (idempotent):
1) idempotency check in `event_log`
2) set `order.status` to cancelled/refunded
3) load all `order_component_allocation` for order where status=active
4) for each allocation:
   - releaseQty = allocation.quantity_reserved
   - mark allocation released
   - write movement type RELEASE (reverses reserve)
   - update `inventory_balance.reserved -= releaseQty`
5) record event in `event_log`
6) return 200

---

## Flow 5 — Manual stock adjustment (component adjust-stock endpoint exists)

Trigger:
- inventory adjustment UI/API action

Rules:
- Adjustment affects **on_hand** for (component, location)
- It must write movement + update balance

Algorithm:
1) validate tenant permission
2) calculate delta = new_on_hand - current_on_hand (or accept delta directly)
3) write `inventory_movement` type ADJUST with quantity_delta = delta
4) update `inventory_balance.on_hand += delta`
5) return updated balance + movement reference

---

## Flow 6 — Stocktake

### 6A) Create session
Create `stocktake_session` (tenant, location, created_by, status=OPEN)

### 6B) Populate lines
Create `stocktake_line` for each counted component:
- store counted qty
- store system qty at start (snapshot)

### 6C) Apply stocktake (reconcile)
For each line:
- variance = counted - system
- if variance != 0:
  - write movement type STOCKTAKE_ADJUST quantity_delta=variance
  - update balance.on_hand += variance
Close session.

Idempotency:
- applying a stocktake must be single-run (guard by session status)

---

## Flow 7 — Purchase order receive

Trigger:
- purchase order receive action

Behavior:
1) create PO header + lines
2) for each received line:
   - write movement type RECEIVE quantity_delta = received_qty
   - update balance.on_hand += received_qty
3) mark PO received
4) return PO + balances

### Reserve/release movement convention (LOCKED)
Assemblio records reservations in the `inventory_movement` ledger using **negative deltas**:

- RESERVE: `quantity_delta = -deltaReserved`
- RELEASE: `quantity_delta = +releasedQty`

Balances:
- RESERVE increases `inventory_balance.reserved`
- RELEASE decreases `inventory_balance.reserved`

`inventory_balance.on_hand` is unchanged by reserve/release movements.
