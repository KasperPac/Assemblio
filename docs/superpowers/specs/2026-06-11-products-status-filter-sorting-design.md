# Products Page: Real Status Filter + Sortable Columns

**Date:** 2026-06-11
**Status:** Approved

## Problem

The products list page (`src/app/app/products/page.tsx`) has two issues:

1. The "Status" column is fake: it shows `ACTIVE` if a product has variants and
   `PENDING` otherwise. Shopify has no "pending" product status — real statuses
   are `ACTIVE`, `DRAFT`, `ARCHIVED`. There is no `status` column on the
   `product` table and the Shopify sync does not fetch it.
2. The filter dropdown filters by "with variants" / "without variants", which is
   not useful. It should filter by product status instead.
3. Column headers are not sortable.

## Decisions

- **Status granularity:** full Shopify statuses — Active / Draft / Archived.
- **Manual products** (source `manual`, no Shopify status): default to `active`.
  No user-editable status UI for now.
- **Default view:** show all statuses by default (filter = "All"). No products
  silently hidden.
- **Sorting approach:** URL-param sorting, server-rendered (approach A).
  Clickable header links set `?sort=<col>&dir=<asc|desc>`; the page sorts
  already-computed rows server-side. Shareable URLs, no client state,
  consistent with existing search/filter patterns.

## Design

### 1. DB migration

```sql
alter table public.product
  add column status text not null default 'active'
  check (status in ('active', 'draft', 'archived'));
```

Manual products get `active` via the default. Existing rows backfill to
`active` (next Shopify sync corrects synced products).

### 2. Shopify sync (`src/lib/shopify/sync.ts`)

- Add `status` to the products GraphQL query and to `ShopifyProductNode`.
- Map Shopify `ACTIVE` / `DRAFT` / `ARCHIVED` → lowercase `active` / `draft` /
  `archived`. Unknown values fall back to `active`.
- Include `status` in the product upsert rows.

### 3. Products page (`src/app/app/products/page.tsx`)

- Select `status` in the product query. The existing fallback-select chain
  handles a not-yet-migrated DB: if the detailed select fails, fall back to
  selects without `status` and default rows to `active`.
- Replace the `filter` search param (`with-variants` / `without-variants`) with
  a `status` param: `all | active | draft | archived`, default `all`. Delete
  the with/without-variants filtering logic.
- Status badge shows the real status:
  - `active` → success styling (`--ok`)
  - `draft` → warning styling
  - `archived` → neutral/muted styling
- Delete the `PENDING` label logic.
- Sorting via `sort` + `dir` search params. Sortable columns and their keys:
  - `title` — product title (string, case-insensitive)
  - `variants` — variant count (number)
  - `status` — status (string)
  - `price` — sell price (number)
  - `mat_gp` — material GP % (number)
  - `actual_gp` — actual GP % (number)
- Default sort (no `sort` param): `created_at` descending (current behavior).
- Null values (e.g. missing price or GP) always sort last regardless of
  direction.
- Sorting is applied server-side to the in-memory filtered rows after all
  per-product values (variant count, sell price, GP averages) are computed.

### 4. Sortable header links

Each column header in the table header row becomes a `<Link>` that:

- Preserves the current `q` and `status` params.
- Sets `sort=<col>`. If the column is already the active sort, toggles `dir`
  between `asc` and `desc`; otherwise starts with `asc` (strings) — numbers may
  also start `asc` for consistency.
- Shows a ▲/▼ indicator on the active sort column only.
- Plain links are fine; server navigation re-renders the list. No
  `scroll: false` handling required.

Headers can be rendered server-side as plain links — no client component
needed.

### 5. Filter dropdown (`src/app/app/products/product-filters.tsx`)

Replace the variants dropdown with a status dropdown:

- Options: All statuses (`all`), Active, Draft, Archived.
- Writes the `status` param (replacing the old `filter` param usage) and
  preserves other params via the existing `setFilter`-style URL building.

## Error handling

- DB not migrated yet: product select fallback chain defaults `status` to
  `active`; page still renders.
- Invalid `status`/`sort`/`dir` params: treated as defaults (`all`, no sort,
  `asc`).

## Testing

- Type-check (`npx tsc --noEmit`) against known baseline.
- Manual verification: filter by each status, sort each column both
  directions, confirm nulls sort last, confirm badge styling per status.
- Existing vitest baseline unchanged (2 known failures unrelated).
