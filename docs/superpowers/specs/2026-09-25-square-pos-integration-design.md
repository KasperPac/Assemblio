# Square POS integration — design

**Task:** MANUVA-27 · **Date:** 2026-09-25 · **Status:** design approved section by section; awaiting spec review

## 1. Context and goal

A salon is coming onto Manuva. It is **pure resale**: it buys finished retail products and sells
them unchanged. It sells the same products **online through Shopify and in-store through Square**,
so today two systems each hold their own count for the same physical shelf.

**Goal:** Manuva owns the stock number and writes it back to both channels. Square items link to
Manuva by barcode or SKU, with a manual mapping screen for whatever does not match.

**Success looks like:**
- A Square POS sale decrements Manuva stock and the Shopify count within the webhook round trip,
  and a Shopify sale does the same to Square.
- A count change made directly in Square (staff receiving a delivery) is absorbed by Manuva, not
  overwritten.
- No sale line is ever dropped silently: an unmatched line is visible in the mapping queue and is
  consumed once it is linked.

### Approach

**Retail item as a one-line BOM, plus a thin channel seam.** Rejected alternatives:

- *First-class finished-goods stock* — reopens the allocation and reserved-ledger code that
  MANUVA-20 only just stabilised, in the same sprint as a new integration.
- *Full channel-abstraction refactor first* — refactors the Shopify integration while it is under
  App Store review, with nothing delivered to the salon.

### Two findings that shape the work

1. **Manuva has no finished-goods stock.** `inventory_balance` is keyed on `component_id` only.
   Pure resale has no manufacturing step to explode, so there is nowhere to put "12 bottles on
   the shelf".
2. **Nothing in the sales path decrements `on_hand`.** `src/lib/allocation/reconcile-order.ts` only
   moves `reserved` via `apply_reserved_movement`. `applyInventoryMovement` is called from one
   place in the app — the manual adjustment screen (`src/app/app/inventory/actions.ts`). Shopify
   fulfilment sets `fulfilled_at` and releases the reservation; stock is never consumed. For a
   salon the sale *is* the consumption event, so this is a workstream of its own.

## 2. Data model

### Retail item scaffold

One atomic server action creates, for a retail item:

`component` (cost, supplier, reorder point, location, and its `inventory_balance` row)
→ `product` → `product_variant` → `product_bom` v1 `active` → `product_bom_component` qty 1.

- New column `product.kind text not null default 'manufactured'`, check `in ('manufactured','retail')`,
  so the UI can hide BOM machinery for retail items.
- `product_source_shopify_id_chk` already permits `source = 'manual'` with `shopify_id` null — no
  constraint change.
- **When the variant already exists** (a Shopify salon's products are imported from Shopify), the
  scaffold attaches a component and one-line BOM to that existing variant instead of creating a
  new product. One variant, two channel links, one stock number.

### Channel seam — four new tables, all additive

| Table | Purpose |
|---|---|
| `sales_channel` | `(tenant_id, kind, external_account_id)`, plus `stock_write_enabled boolean default false` so a channel's write leg can stay dark. |
| `square_connection` | Access token, **refresh token**, expiry, merchant id, status (`active` / `needs_reconnect`). Mirrors `shopify_install_tokens`; Square tokens expire after 30 days. |
| `channel_item_link` | `variant_id` ↔ `external_variation_id` + `external_location_id`; `match_method` (`barcode` / `sku` / `manual`); `status` (`linked` / `unmatched` / `ambiguous` / `ignored`); `ignored_reason`; `stock_conversion_ratio numeric null`. This table *is* the mapping screen. |
| `square_webhook_event` | Dedupe by Square event id, plus `status` (`processed` / `failed`). Mirrors `shopify_webhook_event`. |

Plus `channel_stock_write` for echo suppression and push retry (section 3.3).

### Changes to existing tables

- `orders` gains `sales_channel_id` and `external_order_id`, unique
  `(tenant_id, sales_channel_id, external_order_id)`. `shopify_order_id` is untouched; existing rows
  are backfilled with their Shopify channel.
- `product_variant` gains nullable `barcode text`, backfilled from Shopify's variant barcode on the
  next sync.

### `apply_sale_consumption`

New Postgres function. Decrements `on_hand` and releases `reserved` in a **single statement**,
idempotent per order line. Single statement is deliberate: MANUVA-20 was caused by this operation
being read → delete → write across round trips. `SECURITY DEFINER`, tenant-guarded like
`apply_reserved_movement`, and EXECUTE explicitly revoked from `anon` and `public`.

## 3. Connector and stock loop

### 3.1 Layout

`src/lib/square/` mirroring the Shopify layout: `auth`, `client`, `token-refresh`, `catalog`,
`orders`, `inventory`, `webhook`, `sync`, `match`. Routes under `src/app/api/square/`.

- Square is **location-scoped**: the catalog is global, inventory and orders are per location. A
  Manuva `location` maps to a Square location. Invisible for a one-site salon, but skipping it
  would mean a rewrite later.
- OAuth scopes: `ITEMS_READ`, `INVENTORY_READ`, `INVENTORY_WRITE`, `ORDERS_READ`,
  `MERCHANT_PROFILE_READ`. **No catalog write** — Manuva never creates items in Square.

### 3.2 The loop is cross-channel only

Both platforms decrement their own stock on their own sale. Write-back is therefore strictly
cross-channel: a Square sale pushes to Shopify only; a Shopify sale pushes to Square only. This
removes the infinite loop by construction rather than by guard.

### 3.3 Echo suppression

Every outbound push writes a `channel_stock_write` row with the quantity sent. An inbound
inventory-count webhook matching that quantity is our own echo and is dropped. Anything else is a
genuine external change — Manuva **absorbs it as an adjustment rather than overwriting it**, then
re-broadcasts to the other channel.

### 3.4 Webhooks are the fast path, never the only path

HMAC-verified, deduped, plus a scheduled full reconcile on the existing `CRON_SECRET` cron to repair
anything missed.

### 3.5 Unmatched lines never fail quietly

The order still writes, is marked partially synced, and the line goes to the mapping queue. Direct
lesson of MANUVA-16.

## 4. Matching and the mapping screen

### 4.1 What Square items link to

A Square **item variation** links to a Manuva `product_variant` — for a Shopify salon, the variant
already imported from Shopify. SKU and UPC live on the Square `ITEM_VARIATION`, not the `ITEM`;
`upc` is a 12–14 digit GTIN.

### 4.2 Precedence

A pure function, `src/lib/square/match.ts`, evaluated per Square variation:

1. An existing `channel_item_link` always wins. Matching never overrides a manual decision.
2. **Barcode** — Square `upc` against `product_variant.barcode`.
3. **SKU** — exact match after trimming, case-sensitive (consistent with the Shopify help text).
4. Zero hits → `unmatched`. Two or more hits → `ambiguous`. Neither auto-links.

Only a single unique hit auto-links, recording `match_method = 'barcode'` or `'sku'`.
`product_variant.sku` and `component.sku` are not unique, so ambiguity is a real case, not an edge.

### 4.3 Filtered before matching

Stored as `ignored` with an `ignored_reason`, so a salon's services do not flood the queue:

- `product_type = APPOINTMENTS_SERVICE`
- `is_archived = true`
- `track_inventory` off at the linked location (respecting `location_overrides`)

**Stock conversions:** where a variation has a `stockable_conversion`, only the stockable variation
is linked. A sale of the non-stockable variation is converted by
`stockable_quantity / nonstockable_quantity` (stored as `stock_conversion_ratio`) before it reaches
`apply_sale_consumption`.

### 4.4 Mapping screen

A **Channels** tab on the Square connection page, following the Manuva design system
(`PageHeader` with eyebrow, composed table, `StatusBadge`, `EmptyState`).

- Rows: `unmatched` and `ambiguous` first, then `linked`; `ignored` behind a filter.
- Columns: Square item and variation name, SKU, UPC, status, suggested Manuva variants (for
  ambiguous rows, the candidates).
- Actions: **Link** · **Create retail item** (runs the section 2 scaffold pre-filled from Square) ·
  **Ignore** · **Unlink**.
- Linking a row that has queued order lines replays their consumption, closing the partially-synced
  state from 3.5.

### 4.5 Re-matching

Triggered by the Square catalog-change webhook and by the nightly reconcile. Runs on unlinked rows
only.

## 5. Error handling

- **Every Supabase `.rpc()` goes through `assertNoError`.** A failed write throws; it never shows up
  as a zero count.
- **Token refresh** runs on a schedule well inside the 30-day expiry. A failed refresh sets
  `square_connection.status = 'needs_reconnect'`, shown in the app. Stock writes stop; nothing is
  silently lost.
- **Webhooks:** HMAC checked against the raw body; bad signature → 401. Duplicate event → 200 and
  skip. A processing failure → still 200, event marked `failed`, retried by the nightly reconcile,
  so Square's own retries do not pile up.
- **Push failures** leave the `channel_stock_write` row `pending`/`failed`. The reconcile pushes the
  **current** Manuva number rather than replaying deltas, so a stale quantity cannot overwrite a
  newer one.
- **429 rate limits:** exponential backoff; the reconcile absorbs the remainder.
- **Negative stock:** a sale is always recorded — it happened. `on_hand` may go below zero only via
  a sale; the item is flagged in stock health, and no channel is ever pushed a negative number
  (it receives 0).

## 6. Testing

- **Unit (vitest):** matcher precedence, ambiguity, ignore filters and stock-conversion ratio; echo
  suppression; webhook signature verification. Square is stubbed with recorded fixtures.
- **Database:** `apply_sale_consumption` idempotency per order line; two concurrent sessions on the
  same line produce exactly one movement — the MANUVA-20 failure as a regression test.
- **Security:** re-run `scripts/probe_anon_rpc_surface.sh` after the migration, since
  `CREATE FUNCTION` grants EXECUTE to `PUBLIC` by default.
- **End to end in the Square sandbox:** connect, catalog import, matching queue, POS sale
  decrementing Manuva, in-store count change absorbed as an adjustment. Requires the sandbox to be
  seeded with a test catalog (duplicate SKU, UPC-only variation, a service, an archived item).

## 7. Rollout

1. Additive migration plus the `sales_channel` backfill for existing Shopify orders. Nothing turns on.
2. Square connector behind a per-tenant flag — sandbox tenant first, then the salon.
3. With the salon: connect, work the mapping queue, **stock count to set Manuva's baseline**, then
   enable the Square push.
4. **Shopify write leg stays off** (`stock_write_enabled = false`) until the App Store review and
   MANUVA-19 clear. Writing to Shopify needs the `write_inventory` scope, and changing requested
   permissions mid-review can restart the review. Tracked as its own item.
5. `docs/qa-feature-test-plan.md` updated in the same change.

## 8. Open items

- Whether Square accepts duplicate SKUs across variations, and the exact webhook event names, were
  not verified against the live API (sandbox calls were blocked during design). The design does not
  depend on either; confirm both during implementation before hard-coding event names.
