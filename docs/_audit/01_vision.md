# Assemblio — Canonical Vision Spec

Source documents consulted:
- `README.md`
- `AGENTS.MD`
- `docs/ARCHITECTURE.MD`
- `docs/PLANNING.MD`
- `docs/FLOWS.MD`
- `docs/DATA_MODEL.MD`
- `docs/STACK.MD`
- `docs/INTEGRATIONS/SHOPIFY.md`
- `docs/ADR/0001-stack-choice.MD`
- `docs/ADR/0002-inventory-source-of-truth - Copy.md`
- `docs/ADR/0003-allocation-location-and-ledger.md.md`

---

## 1. Product Summary

Assemblio is a multi-tenant, Shopify-connected Bill-of-Materials (BOM) and component inventory system. It ingests a merchant's Shopify catalog, orders, and locations, then runs all BOM availability calculations, component reservations/allocations, stocktakes, purchasing, goods-inwards, and movement-ledger logging inside Supabase (Postgres + Auth + RLS). Supabase is the authoritative source of truth for inventory; Shopify inventory is treated as read-only reference data and is never written to. The app ships with a Next.js application surface (landing, login, and an `/app/*` workspace covering dashboard, inventory, orders, BOM, stocktake, purchasing, goods-inwards, reports, settings, trash, and help), Shopify OAuth + webhook endpoints, and an operational integrity audit (UI card + internal API + CLI).

---

## 2. Locked Policies

### 2.1 Tenancy (LOCKED)
- Assemblio is multi-tenant; every domain read/write is constrained by `tenant_id`.
- `tenant_id` is never trusted from client input; it is derived server-side from the authenticated Supabase user session (JWT) and/or server-side mapping.
- RLS / server-side enforcement is required for all queries.
- Testing and fixtures MUST use tenant `Pac-Technologies`.
- Tenant `Fabulous` MUST NEVER be used.
- Multi-tenant access and super-admin support is enabled via `supabase/patches/multi_tenant_access_and_super_admin.sql`.

### 2.2 Inventory Source of Truth (LOCKED — ADR 0002)
- Supabase is the source of truth for inventory balances and availability.
- `inventory_balance` is authoritative for current totals per `(tenant_id, component_id, location_id)`.
- `inventory_movement` is the append-only ledger of changes. Movements are never edited or deleted in normal operation.
- Invariant: every change to `inventory_balance` MUST have at least one accompanying `inventory_movement` row. Never mutate balances without a movement.
- Availability definition: `available = on_hand - reserved` for a given `(component_id, location_id)`.
- Balance updates, movements, and allocations must commit together (single transaction or single RPC).

### 2.3 Allocation Rules (LOCKED — ADR 0003)
- Allocation location = tenant default location. The default location is stored/configured per tenant in settings.
- If a Shopify order does not specify an explicit fulfillment location, Assemblio allocates from that default location.
- No multi-location splitting for allocations in MVP.
- Reserve/release movement convention on `inventory_movement`:
  - RESERVE: `quantity_delta` is negative.
  - RELEASE: `quantity_delta` is positive.
- Reservation effects on `inventory_balance`:
  - RESERVE increases `reserved`.
  - RELEASE decreases `reserved`.
  - `on_hand` is unchanged by reserve/release movements.
- Allocations drive reserved quantities in balances; they are tracked in `order_component_allocation`.

### 2.4 Shopify Write Policy (LOCKED — ADR 0002)
- Assemblio does NOT write Shopify inventory levels.
- Shopify inventory reads are optional and informational only; they do NOT drive availability.
- Required minimum scopes: `read_products`, `read_orders`, `read_locations`.
- Optional: `read_inventory` (only if Shopify inventory reference is shown in UI).
- Prohibited unless a new ADR supersedes this: `write_inventory` (or any Shopify inventory-writing scope).
- Webhooks must verify HMAC, be idempotent (via `event_log`), and return 200 quickly.

---

## 3. Feature Map (by Domain)

### 3.1 Shopify
- Store OAuth install flow (Authorization Code Grant) with HMAC + state verification.
- Persist store identity/metadata in `shopify_store`.
- Persist access tokens per store in `shopify_install_tokens`.
- OAuth callback endpoint exchanges code for access token.
- Webhook registration on install.
- HMAC signature verification on every webhook request.
- Webhook idempotency via `event_log` (key = shop + topic + webhook/order id + payload hash).
- Webhook topics in scope: `orders/create`, `orders/updated`, `orders/cancelled`, `refunds/create` (if implemented), `products/update`, `locations/update`.
- Initial import on install: locations → `location`, products/variants → `shopify_product`/`shopify_variant`, optional informational Shopify inventory levels.
- Manual catalog import endpoint (`/products/shopify/import`).
- Manual sync endpoint (`POST /api/shopify/sync`).
- Product/variant upsert by Shopify IDs on product update webhook.
- BOMs retained (and optionally flagged) when a variant is removed.
- Shopify location → local `location` mapping.
- Shopify rate-limit handling: respect 429 + Retry-After; batch/paginate imports; store last sync cursors/timestamps.
- No Shopify inventory writes.
- App posture: currently Shopify Admin embedded app, migrating to Shopify custom app (same Admin API OAuth, different distribution).
- Store connection managed from Settings UI; install can also be started via `/api/shopify/auth?shop=…`.

### 3.2 BOM
- Define a BOM per Shopify variant (`product_bom`), attached to `shopify_variant`.
- BOM lines (`product_bom_component`) mapping to `component`, with `quantity_per_unit`, `sort_order`, and timestamps.
- BOMs are versioned (`version` field).
- Only one active BOM (`is_active = true`) per variant at a time.
- BOMs are not modified by Shopify product-update webhooks.
- Buildable-quantity computation per variant per location:
  - Load active `product_bom`.
  - For each BOM line, `buildableForLine = floor(available / quantity_per_unit)`.
  - Buildable = min across required lines.
- Edge cases: no active BOM → buildable is null/0 (UI decision); missing component balance → treat available as 0.
- Orders referencing variants without a BOM are recorded in `activity_log` and optionally marked "needs BOM".

### 3.3 Inventory
- `component` as the atomic stocked unit; may map to a Shopify variant SKU or be internal-only.
- Component grouping and filtering via `component_group`.
- Per-location inventory locations in `location` (typically mapping to Shopify locations).
- Balance tracked per `(tenant_id, component_id, location_id)` in `inventory_balance` with fields `on_hand`, `in_prod`, `reserved`, `updated_at`.
- Append-only `inventory_movement` ledger with fields: `component_id`, `location_id`, `delta_on_hand`, `delta_in_prod`, `reason`, `reference_type`, `reference_id`, `created_at`.
- Reason/reference types include: RESERVE, RELEASE, ADJUST, STOCKTAKE_ADJUST, RECEIVE (plus references to orders, stocktakes, purchase orders).
- Manual stock adjustment flow: compute delta, write movement (type ADJUST), update `on_hand`.
- Balance + movement invariant enforced everywhere.
- Transactional commit of balance + movement (+ allocations when applicable) as a single unit.

### 3.4 Allocation
- Shopify order creates a local `order` + `order_line` (upsert by Shopify IDs).
- For each `order_line`, look up active BOM for its variant.
- For each BOM line, compute `required = order_line.qty * bom_component.quantity_per_unit`.
- Create/update `order_component_allocation` keyed by `(order/order_line, component, location)`.
- Allocation uniqueness enforced (`supabase/patches/order_component_allocation_unique.sql`).
- Apply `deltaReserved = required - existingReserved`; if non-zero, write RESERVE movement and update `inventory_balance.reserved`.
- Allocation location = tenant default location when order has no explicit fulfillment location.
- No multi-location splitting.
- Cancel/refund webhook releases active allocations for the order:
  - Mark allocation released.
  - Write RELEASE movement (positive delta).
  - Decrement `inventory_balance.reserved`.
  - Update `order.status` to cancelled/refunded.
- Operations are idempotent via `event_log`.
- Activity logging of missing-BOM scenarios.

### 3.5 Stocktake
- Create `stocktake_session` (tenant, location, created_by, status=OPEN).
- Populate `stocktake_line` entries with counted quantity + system quantity snapshot at start (patch: `supabase/patches/stocktake_expected_snapshot.sql`).
- Apply (reconcile) a session: for each line with `variance = counted - system`:
  - Write STOCKTAKE_ADJUST movement with `quantity_delta = variance`.
  - Update `inventory_balance.on_hand += variance`.
- Close session after apply.
- Apply is single-run, guarded by session status (idempotency).

### 3.6 Purchasing
- Supplier records in `suppliers` (lead times, contacts, etc.).
- Purchase order header (`purchase_order`) and lines (`purchase_order_line`) for components.
- Create PO with header + lines.
- Partial receiving supported (`supabase/patches/purchase_order_partial_receiving.sql`).
- Receive PO line via RPC (`supabase/patches/receive_purchase_order_line_rpc.sql`):
  - Write RECEIVE movement with `quantity_delta = received_qty`.
  - Update `inventory_balance.on_hand += received_qty`.
  - Advance PO status.
- Over-receipt detection surfaced in integrity reports.

### 3.7 Goods-Inwards
- Dedicated `/app/goods-inwards` workspace area for receiving against POs.
- Drives the same RECEIVE movement + balance update pathway as the purchasing receive flow.

### 3.8 Reports / Integrity
- Integrity checks exposed in:
  - Reports UI (`/app/reports`).
  - A summary card on Settings (`/app/settings`).
  - Internal API (`GET /api/internal/integrity`).
  - CLI (`npm run ops:integrity`, backed by `scripts/integrity_audit.mjs`).
- Optional no-fail audit mode: `node scripts/integrity_audit.mjs --tenant Pac-Technologies --no-fail`.
- Checks currently implemented:
  - Negative inventory balances.
  - Over-reservation (reserved > on_hand or equivalent).
  - Balance vs movement reconciliation drift.
  - Duplicate allocation keys.
  - Purchase order over-receipt.
- Human-facing audit trail in `activity_log`.
- System/event-level trace in `event_log` (also used for webhook idempotency, retries, debugging).

### 3.9 Tenancy / Auth
- Supabase Auth (JWT session + RLS) as the authentication provider.
- `tenant` table represents an organization (e.g., Pac-Technologies).
- `profiles` maps `auth.users` to tenant membership and role.
- Sign-up / service flows require `SUPABASE_SERVICE_ROLE_KEY`.
- Super-admin + multi-tenant-access patch applied (`multi_tenant_access_and_super_admin.sql`).
- Tenant context derived server-side; all domain queries scoped by `tenant_id`.
- No secrets stored client-side; no direct Shopify secret token use in the browser.

### 3.10 Landing / Login / Help
- Landing page at `/`.
- Login page at `/login`.
- Help section at `/app/help` (listed as part of the `/app/*` surface).
- Trash area at `/app/trash` for soft-deleted items.
- Settings area at `/app/settings` (connect Shopify, default location, integrity summary).
- Dashboard at `/app/dashboard` (or `/app` root dashboard).
- Screenshots stored in `docs/SCREENSHOTS/`.

---

## 4. App Surface

### 4.1 Web Routes (Next.js)
- `/` — landing.
- `/login` — login page.
- `/app/*` — authenticated workspace, including:
  - `/app/dashboard` — dashboard.
  - `/app/inventory` — inventory + manual adjustments.
  - `/app/orders` — orders list and detail.
  - `/app/bom` — BOM management.
  - `/app/stocktake` — stocktake sessions.
  - `/app/purchasing` — purchase orders.
  - `/app/goods-inwards` — goods inwards / receiving.
  - `/app/reports` — reports + integrity.
  - `/app/settings` — settings (Shopify connection, integrity summary card, tenant default location).
  - `/app/trash` — soft-deleted items.
  - `/app/help` — help.

### 4.2 API Endpoints
- `GET /api/internal/integrity` — internal integrity check endpoint.
- `GET /api/shopify/auth?shop=<shop>.myshopify.com` — start Shopify OAuth install.
- `/api/shopify/callback` — OAuth callback (HMAC + state verification, token exchange).
- `/api/shopify/webhooks` — Shopify webhook receiver (HMAC-verified, idempotent; handler file: `src/app/api/shopify/webhooks/route.ts`).
- `POST /api/shopify/sync` — manual Shopify sync.
- `/products/shopify/import` — manual catalog import endpoint (referenced in FLOWS.MD).
- Component adjust-stock endpoint (referenced in FLOWS.MD — exact path not listed in docs).

### 4.3 CLI / Scripts
- `npm run dev` — local dev server.
- `npm run lint` — lint.
- `npm run build` — production build.
- `npm run test` — tests (may fail on Windows with `spawn EPERM`).
- `npm run ops:integrity` — run the integrity audit (requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
- `node scripts/integrity_audit.mjs --tenant <tenant> [--no-fail]` — direct invocation of the audit script.
- Convention: all added scripts live under `/scripts` and are non-interactive by default.

### 4.4 SQL Artifacts
- `supabase/schema.sql` — canonical schema.
- `supabase/seed.sql` — optional demo seed (includes `Pac-Technologies` fixtures).
- Patches (apply in order):
  - `supabase/patches/shopify_app_patch.sql`
  - `supabase/patches/purchase_order_partial_receiving.sql`
  - `supabase/patches/stocktake_expected_snapshot.sql`
  - `supabase/patches/receive_purchase_order_line_rpc.sql`
  - `supabase/patches/order_component_allocation_unique.sql`
  - `supabase/patches/multi_tenant_access_and_super_admin.sql`

### 4.5 Environment Variables
- Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- For service operations / sign-up flows: `SUPABASE_SERVICE_ROLE_KEY`.
- Shopify required: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, `NEXT_PUBLIC_APP_URL`.
- Shopify optional: `SHOPIFY_API_VERSION` (default `2026-01`).

---

## 5. Data Contracts (Key Tables & Invariants)

Authoritative source: `supabase/schema.sql`. Do not invent fields.

### Tenancy / Users
- `tenant` — organization record; all domain data attaches here.
- `profiles` — maps `auth.users` to tenant membership + role.

### Shopify Integration
- `shopify_store` — shop identity (domain, store name, status).
- `shopify_install_tokens` — access tokens per connected store.
- `shopify_product` — local snapshot of Shopify product.
- `shopify_variant` — local snapshot of Shopify variant; primary attach point for BOM.

### Core Inventory
- `component` — stocked item; may map to a Shopify variant SKU or be internal-only; groupable via `component_group`.
- `component_group` — grouping/filtering of components.
- `location` — inventory location, typically maps to a Shopify location.
- `inventory_balance` — authoritative totals per `(tenant_id, component_id, location_id)`.
  - Fields: `on_hand`, `in_prod`, `reserved`, `updated_at`.
  - Invariant: every mutation must be accompanied by an `inventory_movement` record.
- `inventory_movement` — append-only ledger.
  - Fields: `component_id`, `location_id`, `delta_on_hand`, `delta_in_prod`, `reason`, `reference_type`, `reference_id`, `created_at`.
  - Invariant: never edited or deleted in normal operation.

### BOM
- `product_bom` — versioned BOM tied to `shopify_variant_id`.
  - Fields: `shopify_variant_id`, `version`, `is_active`, `created_at`.
  - Invariant: only one active BOM per variant.
- `product_bom_component` — BOM lines.
  - Fields: `product_bom_id`, `component_id`, `quantity_per_unit`, `sort_order`, `created_at`, `updated_at`.

### Orders + Allocations
- `order` — local representation of Shopify order (Shopify IDs, statuses, timestamps).
- `order_line` — local order lines mapping to Shopify variants (qty, variant_id, etc.).
- `order_component_allocation` — reservations per order/order line.
  - Fields: `order_line_id`, `component_id`, `quantity`, `created_at`.
  - Invariant: allocations drive reserved quantities in balances.
  - Invariant: allocation key uniqueness enforced (patch `order_component_allocation_unique.sql`).

### Stocktake
- `stocktake_session` — header (location, status, started/closed, created_by).
- `stocktake_line` — counted lines (`session_id`, `component_id`, `counted`, plus system snapshot from patch).
- Invariant: applying a session is single-run (guarded by status).

### Purchasing
- `suppliers` — supplier records (lead times, contact).
- `purchase_order` — PO header.
- `purchase_order_line` — PO lines for components.
- Receiving creates RECEIVE movements and increases `on_hand`.

### Audit / Logs
- `activity_log` — human-facing audit trail.
- `event_log` — system/event-level log; used for webhook idempotency, retries, debugging.

### Cross-Cutting Invariants
- Every write is tenant-scoped by `tenant_id` (derived server-side).
- Every balance change writes a movement; every movement commits with its balance change (single transaction / RPC).
- Webhook processing is idempotent by `(shop, topic, webhook/order id, payload hash)`.
- Allocation location = tenant default location (MVP, no splits).
- Reserve = negative delta, Release = positive delta, on `inventory_movement`.

---

## 6. Roadmap / Unfinished Items Called Out in Docs

- Migration from Shopify Admin embedded app to a Shopify custom app (same OAuth model, different distribution) — stated as "soon" in `STACK.MD` and `INTEGRATIONS/SHOPIFY.md`.
- `refunds/create` webhook listed as "if implemented; if not, document as future" in `FLOWS.MD`.
- UI behavior for variants removed in Shopify while their BOM remains: "flagged (implementation choice)" — implementation choice not yet finalized.
- Buildable display when no active BOM is present: "buildable is null/0 (decide UI)" — UI decision pending.
- `component` mapping rule — "may map to a Shopify variant SKU or may be internal-only (confirm in UI rules)" — UI rules to be confirmed.
- Shopify rate-limit handling / last sync cursors — "store last sync cursors/timestamps in Supabase if needed" — conditional, not yet definitively implemented.
- `npm run test` known to fail on some Windows environments with `spawn EPERM` — flagged as an open environment issue.
- Frontend framework is intentionally not locked (`STACK.MD`) — noted that the project may be on WeWeb today while a custom Next.js frontend is being built.
- Additional integrity checks beyond the current four are implied as an ongoing area (the Reports/Integrity surface is designed to grow).
- `docs/SCREENSHOTS/` exists as a placeholder for screenshots — population is pending.

---

## 7. Contradictions / Ambiguities Between Docs

1. PLANNING.MD is completely out of sync with the rest of the docs.
   - `docs/PLANNING.MD` describes Assemblio as a CLI scaffolding tool ("Assemblio CLI must accept a project config file… generate deterministic outputs… produce manifest of generated files"), declares Non-goals as "UI, Cloud sync, Multi-tenant architecture," and lists a first command `assemblio generate --config project.json`.
   - Every other document (README, AGENTS, ARCHITECTURE, FLOWS, DATA_MODEL, STACK, SHOPIFY, ADRs) describes Assemblio as a multi-tenant Shopify-connected BOM/inventory web app.
   - PLANNING.MD appears to be stale / from a different product and directly contradicts the locked tenancy and UI scope.

2. Reserve movement sign convention is stated cleanly in ADR 0003 and in the "LOCKED" section of FLOWS.MD ("RESERVE: quantity_delta = -deltaReserved; RELEASE: quantity_delta = +releasedQty"), but the earlier Flow 3 body in FLOWS.MD still contains a tentative note: "write inventory_movement type = RESERVE with quantity_delta = -deltaReserved? (choose convention)". The question mark should be removed — the convention is locked.

3. `inventory_movement` field naming is ambiguous.
   - `DATA_MODEL.MD` lists the field as `delta_on_hand` (and `delta_in_prod`).
   - `FLOWS.MD`, `ARCHITECTURE.MD`, `AGENTS.MD`, and `ADR 0003` refer to `quantity_delta`.
   - Only `supabase/schema.sql` (not read here) can resolve which is the true column name.

4. `inventory_balance` fields — `DATA_MODEL.MD` lists `on_hand`, `in_prod`, `reserved`, `updated_at`. The "availability" definition across FLOWS/AGENTS uses only `on_hand` and `reserved`; `in_prod` is mentioned in the data model and as `delta_in_prod` on movements, but no flow describes how `in_prod` is produced/consumed. Its semantics are under-specified in the docs.

5. Refund handling is inconsistent.
   - `FLOWS.MD` Flow 4 groups cancel/refund together, and mentions "refunds/create (if implemented; if not, document as future)".
   - `INTEGRATIONS/SHOPIFY.md` also lists `refunds/create` as "if used".
   - Current implementation state is unclear from docs alone.

6. Webhook topic list is not fully locked.
   - `INTEGRATIONS/SHOPIFY.md` says topics are "suggested… confirm against your existing endpoints" and points at `src/app/api/shopify/webhooks/route.ts` as the source of truth. Docs do not enumerate the authoritative list.

7. ADR 0002 filename.
   - The file is named `0002-inventory-source-of-truth - Copy.md` (has " - Copy" suffix and uses `.md` casing, unlike the other ADRs which use `.MD`). This looks like a filesystem artifact, not an intentional filename.

8. ADR 0003 filename has a doubled extension: `0003-allocation-location-and-ledger.md.md`. Almost certainly unintentional.

9. App surface route casing / paths.
   - `README.md` lists the `/app/*` top-level areas (dashboard, inventory, orders, BOM, stocktake, purchasing, goods-inwards, reports, settings, trash, help) but does not enumerate exact route paths or sub-routes. Confirming exact Next.js routes requires reading `src/app/app/**`.

10. Manual catalog import endpoint path.
    - `FLOWS.MD` mentions `/products/shopify/import` as an existing endpoint.
    - `README.md` instead documents `POST /api/shopify/sync` as the manual sync.
    - Unclear whether these are two separate endpoints, aliases, or one is outdated.

11. Component adjust-stock endpoint.
    - `FLOWS.MD` references a "component adjust-stock endpoint (exists)" but neither README nor the docs give its path.

12. Shopify app posture.
    - `STACK.MD` and `INTEGRATIONS/SHOPIFY.md` say "currently Admin embedded app, migrating to custom app soon."
    - Other docs assume a standalone Next.js app with landing + login. The interaction between a standalone Next.js surface and an embedded Shopify Admin surface is not spelled out.

13. Frontend framework ambiguity.
    - `STACK.MD` says the framework is "intentionally not locked… because you may be on WeWeb today."
    - README, routes, and integrity UI all assume a Next.js app. The role of WeWeb (if any) vs. the Next.js `/app/*` surface is not reconciled.

14. BOM "flagged" behavior when a Shopify variant is removed is called an "implementation choice" in FLOWS.MD — unresolved.

15. Schema casing/filename casing is mixed across docs (`ARCHITECTURE.MD` vs `SHOPIFY.md` vs `0002-…md` vs `0003-…md.md`). Not a logic contradiction, but a documentation-hygiene issue.
