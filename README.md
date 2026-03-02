# Assemblio

Assemblio is a multi-tenant Shopify-connected BOM and component inventory system.
It ingests Shopify catalog and orders, then runs BOM availability, allocations,
stocktakes, purchasing, and movement logging in Supabase.

## Policies (Locked)

- Supabase is the source of truth for inventory.
- Assemblio does not write Shopify inventory levels.
- Every read/write is tenant-scoped by `tenant_id`.
- Testing/fixtures tenant: `Pac-Technologies`.
- Never use tenant: `Fabulous`.

## Canonical Contracts

- Schema: `supabase/schema.sql`
- SQL patches: `supabase/patches/*.sql`

Do not invent table fields; implement against schema contracts.

## App Surface

- Landing: `/`
- Login: `/login`
- App routes: `/app/*` (dashboard, inventory, orders, BOM, stocktake, purchasing, goods-inwards, reports, settings, trash, help)
- Internal integrity API: `GET /api/internal/integrity`

## Local Setup

1. Install deps:
```bash
npm install
```
2. Configure environment:
- Copy `.env.example` to `.env.local`.
- Set Supabase keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- For service operations/sign-up flows: set `SUPABASE_SERVICE_ROLE_KEY`.
3. Provision database:
- Apply `supabase/schema.sql`.
- Apply patches if needed (in order used by this repo):
  - `supabase/patches/shopify_app_patch.sql`
  - `supabase/patches/purchase_order_partial_receiving.sql`
  - `supabase/patches/stocktake_expected_snapshot.sql`
  - `supabase/patches/receive_purchase_order_line_rpc.sql`
  - `supabase/patches/order_component_allocation_unique.sql`
  - `supabase/patches/multi_tenant_access_and_super_admin.sql`
4. Optional demo seed:
- Apply `supabase/seed.sql` (includes `Pac-Technologies` fixtures).

## Run Commands

```bash
npm run dev
npm run lint
npm run build
npm run test
npm run ops:integrity
```

Notes:
- `npm run test` can fail in some Windows environments with `spawn EPERM`.
- `npm run ops:integrity` requires:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

Optional no-fail audit mode:
```bash
node scripts/integrity_audit.mjs --tenant Pac-Technologies --no-fail
```

## Shopify Integration

Required env:
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_SCOPES`
- `NEXT_PUBLIC_APP_URL`

Optional env:
- `SHOPIFY_API_VERSION` (defaults to `2026-01`)

Flows:
- Start OAuth from Settings or `/api/shopify/auth?shop=your-store.myshopify.com`
- Callback: `/api/shopify/callback`
- Webhooks: `/api/shopify/webhooks` (HMAC + idempotent processing)
- Manual sync: `POST /api/shopify/sync`

## Inventory and Allocation Semantics

- All inventory changes must write:
1. append-only `inventory_movement`
2. corresponding `inventory_balance` update
- Never mutate `inventory_balance` without movement.
- Allocation location is tenant default location (no split allocation).
- Reservation movements use negative deltas in `inventory_movement`.

## Operational Integrity

Integrity checks are available in:
- Reports UI (`/app/reports`)
- Settings summary card (`/app/settings`)
- Internal API (`/api/internal/integrity`)
- CLI (`npm run ops:integrity`)

Current checks:
- Inventory invariants (negative balances, over-reservation)
- Balance vs movement reconciliation drift
- Duplicate allocation keys
- Purchase order over-receipt

## Screenshots

Store screenshots in `docs/SCREENSHOTS/`.
