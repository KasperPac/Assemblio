# Shopify Product Categories — Filters & Grouping (Design)

**Date:** 2026-07-01
**Status:** Approved design — ready for implementation plan
**Author:** Kasper + Claude

## Problem

We sync products from Shopify but capture none of Shopify's categorisation data.
Merchants (e.g. Fabulous) organise their catalogue in Shopify using product type,
tags, collections, and the Standard Product Taxonomy. Today the Manuva products page
(`/app/products`) can only filter by free-text search and status. There is no way to
slice or group the catalogue the way the merchant already thinks about it.

## Goal

Sync Shopify's category-like fields and let users **filter** and **group** the products
list by them. Fields are **read-only mirrors of Shopify** (no in-app editing, no
write-back). Manual (non-Shopify) products simply show blank/uncategorised until
categorised in Shopify.

### Fields in scope (all four)

| Field | Shopify source | Nature |
|---|---|---|
| Product type | `product.productType` | Merchant free-text, single value per product |
| Tags | `product.tags` | Merchant free-text, many per product |
| Collections | `product.collections` | Merchant-defined groupings, many per product |
| Category | `product.category` (Standard Taxonomy) | Shopify global taxonomy, single node per product |

All four are available **inline** on the GraphQL `Product` node — no separate API call
is required (collections included).

## Non-goals

- Editing category fields inside Manuva or writing changes back to Shopify.
- Smart-collection rule evaluation on our side (we store the resulting membership only).
- Filtering the orders or components pages by category (products page only).
- Incremental sync changes (the existing full-store sync is reused as-is).

---

## Architecture

Three layers, following existing codebase patterns (pure logic in `src/lib/`, thin
client filter component, server-side filtering in `page.tsx`, manual-apply SQL patch).

### 1. Data model

New SQL patch: **`supabase/patches/product_categories.sql`** — **must be applied
manually before deploy** (matches the templates-feature convention).

**`product` — new columns:**

```sql
alter table public.product
  add column if not exists product_type text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists category_name text,
  add column if not exists category_full_name text;

create index if not exists product_tenant_product_type_idx
  on public.product (tenant_id, product_type);
create index if not exists product_tags_gin_idx
  on public.product using gin (tags);
```

- `product_type` — single free-text category (nullable).
- `tags` — `text[]`, default `'{}'`, GIN-indexed for containment filtering.
- `category_name` — Standard Taxonomy **leaf** name (e.g. `Candles`), used for group
  headers and the category filter option label.
- `category_full_name` — full path (e.g. `Home & Garden > Decor > Candles`), used for
  a tooltip / disambiguation only.

**`shopify_collection` — new table:**

```sql
create table if not exists public.shopify_collection (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_id text not null,
  title text not null,
  handle text,
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id)
);
```

**`product_collection` — join table:**

```sql
create table if not exists public.product_collection (
  tenant_id uuid not null references public.tenant(id),
  product_id uuid not null references public.product(id) on delete cascade,
  collection_id uuid not null references public.shopify_collection(id) on delete cascade,
  primary key (product_id, collection_id)
);
create index if not exists product_collection_collection_idx
  on public.product_collection (collection_id);
```

- RLS: both new tables get tenant-isolation policies mirroring `product` /
  `product_variant` (select for tenant members; writes via service role / admin client
  only, as sync uses the admin client).
- Both new tables are registered in `super_admin_foundation.sql`'s table list (avoiding
  the labor_template omission that is a currently-tracked follow-up).
- New tables/columns are not in the generated Supabase types → accessed via `as any`
  casts, consistent with the templates feature.

### 2. Sync (`src/lib/shopify/sync.ts`)

**Extend the GraphQL `Products` query** node selection:

```graphql
nodes {
  id
  title
  description
  status
  featuredImage { url }
  productType
  tags
  category { name fullName }
  collections(first: 50) { nodes { id title handle } }
  variants(first: 100) { nodes { id title sku price } }
}
```

- Widen the `ShopifyProductNode` type accordingly.
- **Product upsert** (`sync.ts:225-233`): add `product_type`, `tags`,
  `category_name`, `category_full_name` to the payload, derived via a new pure
  helper `normalizeProductCategories(node)`.
- **Collections sync** (new block after the product upsert, once `productMap` exists):
  1. Collect distinct collections across the fetched batch (`shopify_id → {title, handle}`).
  2. Upsert into `shopify_collection` (onConflict `tenant_id,shopify_id`), building a
     `shopify collection id → local collection id` map from the returned rows (same
     "map from upsert return" technique used elsewhere in this file to avoid 414s).
  3. For each synced product: delete existing `product_collection` rows for that
     `product_id`, then insert the current membership. Each product appears exactly
     once per sync, so delete-then-insert is safe and keeps membership authoritative.
- Optionally extend the `shopify.sync_completed` activity-log metadata with a
  `collections` count (nice-to-have, not required).

**New pure module: `src/lib/shopify/product-categories.ts`**

```ts
export type NormalizedProductCategories = {
  productType: string | null;
  tags: string[];
  categoryName: string | null;
  categoryFullName: string | null;
  collections: Array<{ shopifyId: string; title: string; handle: string | null }>;
};
export function normalizeProductCategories(node): NormalizedProductCategories
```

Handles: null `category`, empty/whitespace `productType`, empty `tags`, trims values,
dedupes collections by `shopifyId`. Unit-tested.

### 3. Products page

**`src/app/app/products/product-filters.tsx`** — add controls next to the existing
Search + Status:

- **Type** — single `<select>` (options = distinct product types).
- **Tags** — multi-select (comma-joined `tags` URL param).
- **Collection** — multi-select (comma-joined `collection` URL param, by collection id).
- **Category** — single `<select>` (options = distinct `category_name`).
- **Group by** — single `<select>`: `None | Type | Collection | Category`.

Option lists (facets) are passed **as props** from `page.tsx`; the component does not
fetch. All params set via `router.replace(url, { scroll: false })`, consistent with the
existing `status` handler, and each handler deletes `page` on change so filtering resets
to page 1.

URL params: `type`, `tags`, `collection`, `category`, `group`.

**`src/app/app/products/page.tsx`:**

- Fetch `product_collection` + `shopify_collection` for the tenant (paginated via
  `fetchAllRows` if needed), build `collectionsByProduct` and a collection lookup.
- Compute facet option lists from the full product set + collections.
- Apply the new filters inside the existing `filteredProducts` block (`page.tsx:317`),
  using the pure predicate. Null values fall into an **"Uncategorised"** bucket.
- When `group !== none`, sort so grouped rows are contiguous and render a **group
  header row inline** wherever the group key changes between consecutive rows.
  **Pagination is unchanged** (25 rows/page); a large group may span pages — accepted.
- New columns slot into the existing **fallback cascade** (`page.tsx:233-287`) as
  optional/nullable: if the patch is not applied, the primary select errors and the
  fallbacks return rows without the new fields, which default to `null`/`[]`. Filters
  then show no options and grouping falls back to a single "Uncategorised" group — the
  list still renders. No white-screen.

**New pure modules (unit-tested):**

- `src/lib/products/facets.ts` — `buildFacets(products, collectionsByProduct)` →
  `{ productTypes[], tags[], categories[], collections[] }`, distinct + sorted.
- `src/lib/products/grouping.ts` — `matchesCategoryFilters(product, collections, filters)`
  predicate, and `resolveGroupKey(product, collections, groupBy)` returning the group
  label (with `"Uncategorised"` for nulls).

---

## Data flow

```
Shopify webhook (products/create|update) or manual "Import Products"
  → syncShopifyStoreData()
    → fetchProducts()  [GraphQL now includes productType/tags/category/collections]
    → normalizeProductCategories(node) per product
    → upsertProducts()  [+ product_type, tags, category_name, category_full_name]
    → upsert shopify_collection, rebuild product_collection per product
  → product / product_collection / shopify_collection tables

/app/products (server render)
  → fetch products + collections
  → buildFacets() → filter option lists (props → ProductFilters)
  → matchesCategoryFilters() → filteredProducts
  → sort + resolveGroupKey() → inline group headers
  → existing 25-row pagination
```

## Error handling & edge cases

- **Patch not applied:** fallback cascade degrades to nulls; page renders, filters empty.
- **Null category / no product_type / no tags:** "Uncategorised" group; product still
  listed; filters simply don't match it unless "Uncategorised" is a filterable value
  (tags/type filters exclude it; grouping shows it as its own bucket).
- **Collection renamed in Shopify:** next sync updates `shopify_collection.title`;
  membership rebuilt; no drift.
- **Product removed from a collection in Shopify:** delete-then-insert rebuild drops the
  stale `product_collection` row.
- **>1000 rows:** collection fetch uses `fetchAllRows` paging like the variants fetch.
- **Tenant isolation:** all new queries filter by `tenant_id`; RLS enforces.

## Testing

- `src/lib/shopify/product-categories.test.ts` — normalisation of all four fields,
  null/empty/whitespace handling, collection dedupe.
- `src/lib/products/facets.test.ts` — distinct + sorted option lists, empty catalogue.
- `src/lib/products/grouping.test.ts` — filter predicate (type/tags/collection/category,
  multi-select semantics), group-key resolution incl. "Uncategorised".
- Baseline `npx tsc --noEmit` and `npx vitest run --pool threads --maxWorkers 1` must
  show no new regressions beyond the known baseline.

## Docs (required by CLAUDE.md)

- Update `docs/qa-feature-test-plan.md`: add a "Product categories & filters" checklist
  under the Products domain (sync captures fields; filter by type/tags/collection/category;
  group by each; uncategorised bucket; patch-not-applied degrades gracefully). Append a
  `## Changelog` line dated 2026-07-01.

## Deploy notes

1. Apply `supabase/patches/product_categories.sql` manually **before** deploying the code.
2. Register new tables in `super_admin_foundation.sql`.
3. Trigger a Shopify sync (webhook or "Import Products") to backfill categories.

## Follow-ups (out of scope)

- In-app editing / write-back of categories.
- Category filters on orders/components pages.
- Persisted per-user default grouping.
- `(tenant_id, product_type)` and collection-membership query performance at very large
  catalogue scale (indexes added cover the common case).
