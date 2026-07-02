# Shopify Product Categories — Filters & Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Shopify product type, tags, Standard-Taxonomy category, and collections (read-only), and let users filter and group the products page by them.

**Architecture:** Extend the existing full-store Shopify sync (all four fields are inline on the GraphQL `Product` node — no extra API call). Store scalars on `product` and collections in a `shopify_collection` + `product_collection` join. Pure, unit-tested logic modules handle normalisation, facet building, and filter/group; the products page composes them server-side.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript, Vitest, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-07-01-shopify-product-categories-design.md`

**Baselines (must not regress):**
- `npx tsc --noEmit` → 2 pre-existing errors in `.next/types/validator.ts` only; ZERO under `src/`.
- `npx vitest run --pool threads --maxWorkers 1` → 2 pre-existing failures (`allocation/engine.test.ts`, `inventory/invariants.test.ts`).

---

### Task 0: Database patch — columns, collection tables, RLS

**Goal:** Add category columns to `product` and create `shopify_collection` + `product_collection` with tenant-isolation RLS. Manual-apply before deploy.

**Files:**
- Create: `supabase/patches/product_categories.sql`
- Modify: `supabase/patches/super_admin_foundation.sql:104` (add the two new tables to the isolation array)

**Acceptance Criteria:**
- [ ] `product` gains `product_type text`, `tags text[] not null default '{}'`, `category_name text`, `category_full_name text`.
- [ ] `shopify_collection` and `product_collection` created with the documented columns, uniqueness, and cascade.
- [ ] Both new tables have RLS enabled with a `_tenant_isolation` policy using `public.current_tenant_id()` / `public.is_super_admin()`.
- [ ] Both new tables appended to the `super_admin_foundation.sql` isolation array.
- [ ] Patch is idempotent (`if not exists` / `drop policy if exists`).

**Verify:** No automated DB test in this repo. Verify by review: `psql` dry-read not required. Confirm the SQL parses (balanced `$$`, valid syntax) and matches the patterns below.

**Steps:**

- [ ] **Step 1: Create the patch file**

Create `supabase/patches/product_categories.sql`:

```sql
-- Shopify product categories: product_type, tags, standard-taxonomy category,
-- and collections. Read-only mirrors of Shopify. Apply manually before deploy.

-- 1. Scalar category fields on product ----------------------------------------
alter table public.product
  add column if not exists product_type text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists category_name text,
  add column if not exists category_full_name text;

create index if not exists product_tenant_product_type_idx
  on public.product (tenant_id, product_type);
create index if not exists product_tags_gin_idx
  on public.product using gin (tags);

-- 2. Collections ---------------------------------------------------------------
create table if not exists public.shopify_collection (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_id text not null,
  title text not null,
  handle text,
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id)
);

create table if not exists public.product_collection (
  tenant_id uuid not null references public.tenant(id),
  product_id uuid not null references public.product(id) on delete cascade,
  collection_id uuid not null references public.shopify_collection(id) on delete cascade,
  primary key (product_id, collection_id)
);

create index if not exists product_collection_collection_idx
  on public.product_collection (collection_id);
create index if not exists shopify_collection_tenant_idx
  on public.shopify_collection (tenant_id);

-- 3. RLS -----------------------------------------------------------------------
alter table public.shopify_collection enable row level security;
drop policy if exists shopify_collection_tenant_isolation on public.shopify_collection;
create policy shopify_collection_tenant_isolation on public.shopify_collection
  using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

alter table public.product_collection enable row level security;
drop policy if exists product_collection_tenant_isolation on public.product_collection;
create policy product_collection_tenant_isolation on public.product_collection
  using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
```

- [ ] **Step 2: Register the new tables for super-admin RLS re-application**

In `supabase/patches/super_admin_foundation.sql`, the isolation array ends at line 104 with `'bom_template_line'` (line 105 is the closing `]`). Add the two tables before the closing bracket:

```sql
    'bom_template_line',
    'shopify_collection',
    'product_collection'
  ]
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/product_categories.sql supabase/patches/super_admin_foundation.sql
git commit -m "feat(shopify): add product-category schema patch (columns + collections + RLS)"
```

---

### Task 1: `normalizeProductCategories` pure module

**Goal:** A pure function that turns a Shopify product node's raw category fields into a normalised shape, handling nulls/whitespace/dedupe.

**Files:**
- Create: `src/lib/shopify/product-categories.ts`
- Test: `src/lib/shopify/product-categories.test.ts`

**Acceptance Criteria:**
- [ ] `null` category → `categoryName`/`categoryFullName` both null.
- [ ] Whitespace-only `productType` → null; trimmed otherwise.
- [ ] `tags` trimmed, empties dropped, order preserved.
- [ ] Collections deduped by `shopifyId`, `handle` null-safe.

**Verify:** `npx vitest run src/lib/shopify/product-categories.test.ts --pool threads --maxWorkers 1` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `src/lib/shopify/product-categories.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeProductCategories } from "./product-categories";

describe("normalizeProductCategories", () => {
  it("normalizes a fully-populated node", () => {
    const result = normalizeProductCategories({
      productType: " Candle ",
      tags: ["gift", " summer ", ""],
      category: { name: "Candles", fullName: "Home & Garden > Decor > Candles" },
      collections: {
        nodes: [
          { id: "gid://c/1", title: "Best Sellers", handle: "best-sellers" },
          { id: "gid://c/1", title: "Best Sellers", handle: "best-sellers" },
          { id: "gid://c/2", title: "New", handle: null },
        ],
      },
    });
    expect(result.productType).toBe("Candle");
    expect(result.tags).toEqual(["gift", "summer"]);
    expect(result.categoryName).toBe("Candles");
    expect(result.categoryFullName).toBe("Home & Garden > Decor > Candles");
    expect(result.collections).toEqual([
      { shopifyId: "gid://c/1", title: "Best Sellers", handle: "best-sellers" },
      { shopifyId: "gid://c/2", title: "New", handle: null },
    ]);
  });

  it("handles nulls and empties", () => {
    const result = normalizeProductCategories({
      productType: "   ",
      tags: [],
      category: null,
      collections: { nodes: [] },
    });
    expect(result.productType).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.categoryName).toBeNull();
    expect(result.categoryFullName).toBeNull();
    expect(result.collections).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shopify/product-categories.test.ts --pool threads --maxWorkers 1`
Expected: FAIL — cannot find module `./product-categories`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/shopify/product-categories.ts`:

```ts
export type ShopifyProductCategoryInput = {
  productType?: string | null;
  tags?: string[] | null;
  category?: { name: string | null; fullName: string | null } | null;
  collections?: {
    nodes: Array<{ id: string; title: string; handle: string | null }>;
  } | null;
};

export type NormalizedProductCategories = {
  productType: string | null;
  tags: string[];
  categoryName: string | null;
  categoryFullName: string | null;
  collections: Array<{ shopifyId: string; title: string; handle: string | null }>;
};

function cleanString(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeProductCategories(
  node: ShopifyProductCategoryInput
): NormalizedProductCategories {
  const tags = (node.tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const collections: NormalizedProductCategories["collections"] = [];
  for (const c of node.collections?.nodes ?? []) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    collections.push({ shopifyId: c.id, title: c.title, handle: c.handle ?? null });
  }

  return {
    productType: cleanString(node.productType),
    tags,
    categoryName: cleanString(node.category?.name),
    categoryFullName: cleanString(node.category?.fullName),
    collections,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shopify/product-categories.test.ts --pool threads --maxWorkers 1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shopify/product-categories.ts src/lib/shopify/product-categories.test.ts
git commit -m "feat(shopify): add normalizeProductCategories pure helper"
```

---

### Task 2: `facets.ts` — distinct filter options

**Goal:** Build distinct, sorted option lists (product types, tags, categories, collections) from a product set + collection membership, for the filter dropdowns.

**Files:**
- Create: `src/lib/products/facets.ts`
- Test: `src/lib/products/facets.test.ts`

**Acceptance Criteria:**
- [ ] Returns `{ productTypes, tags, categories, collections }`.
- [ ] `productTypes`/`categories`/`tags`: distinct, case-insensitive sort, nulls/empties excluded.
- [ ] `collections`: `{ id, title }[]`, distinct by id, sorted by title.
- [ ] Empty input → all empty arrays.

**Verify:** `npx vitest run src/lib/products/facets.test.ts --pool threads --maxWorkers 1` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `src/lib/products/facets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFacets } from "./facets";

describe("buildFacets", () => {
  it("builds distinct sorted option lists", () => {
    const products = [
      { id: "p1", product_type: "Candle", tags: ["gift", "summer"], category_name: "Candles" },
      { id: "p2", product_type: "candle", tags: ["gift"], category_name: null },
      { id: "p3", product_type: null, tags: [], category_name: "Soap" },
    ];
    const collectionsByProduct = new Map<string, Array<{ id: string; title: string }>>([
      ["p1", [{ id: "c1", title: "New" }, { id: "c2", title: "Best" }]],
      ["p2", [{ id: "c2", title: "Best" }]],
    ]);
    const facets = buildFacets(products, collectionsByProduct);
    expect(facets.productTypes).toEqual(["Candle", "candle"]); // distinct values, sorted case-insensitively
    expect(facets.tags).toEqual(["gift", "summer"]);
    expect(facets.categories).toEqual(["Candles", "Soap"]);
    expect(facets.collections).toEqual([
      { id: "c2", title: "Best" },
      { id: "c1", title: "New" },
    ]);
  });

  it("handles empty input", () => {
    const facets = buildFacets([], new Map());
    expect(facets).toEqual({ productTypes: [], tags: [], categories: [], collections: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/products/facets.test.ts --pool threads --maxWorkers 1`
Expected: FAIL — cannot find module `./facets`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/products/facets.ts`:

```ts
export type FacetProduct = {
  id: string;
  product_type: string | null;
  tags: string[] | null;
  category_name: string | null;
};

export type Facets = {
  productTypes: string[];
  tags: string[];
  categories: string[];
  collections: Array<{ id: string; title: string }>;
};

function sortedDistinct(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t.length > 0) set.add(t);
  }
  return Array.from(set).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

export function buildFacets(
  products: FacetProduct[],
  collectionsByProduct: Map<string, Array<{ id: string; title: string }>>
): Facets {
  const productTypes = sortedDistinct(products.map((p) => p.product_type));
  const categories = sortedDistinct(products.map((p) => p.category_name));
  const tags = sortedDistinct(products.flatMap((p) => p.tags ?? []));

  const collectionMap = new Map<string, string>();
  for (const list of collectionsByProduct.values()) {
    for (const c of list) collectionMap.set(c.id, c.title);
  }
  const collections = Array.from(collectionMap.entries())
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

  return { productTypes, tags, categories, collections };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/products/facets.test.ts --pool threads --maxWorkers 1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/products/facets.ts src/lib/products/facets.test.ts
git commit -m "feat(products): add buildFacets for category filter options"
```

---

### Task 3: `grouping.ts` — filter predicate + group-key resolver

**Goal:** Pure filter predicate (type/tags/collection/category, multi-select semantics) and a group-key resolver with an "Uncategorised" bucket.

**Files:**
- Create: `src/lib/products/grouping.ts`
- Test: `src/lib/products/grouping.test.ts`

**Acceptance Criteria:**
- [ ] `matchesCategoryFilters` returns true when all active filters match; empty filters match everything.
- [ ] Type/category: exact match. Tags: product must contain ALL selected tags. Collection: product must be in ANY selected collection.
- [ ] `resolveGroupKey` returns the type/category/collection label or `"Uncategorised"` for null; for collections a product with multiple collections groups under its first collection title (documented choice).
- [ ] `groupBy === "none"` → `resolveGroupKey` returns `""` (caller renders no headers).

**Verify:** `npx vitest run src/lib/products/grouping.test.ts --pool threads --maxWorkers 1` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `src/lib/products/grouping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchesCategoryFilters, resolveGroupKey } from "./grouping";

const p = {
  id: "p1",
  product_type: "Candle",
  tags: ["gift", "summer"],
  category_name: "Candles",
};
const collections = [
  { id: "c1", title: "Best Sellers" },
  { id: "c2", title: "New" },
];

describe("matchesCategoryFilters", () => {
  it("matches when no filters set", () => {
    expect(matchesCategoryFilters(p, collections, {})).toBe(true);
  });
  it("matches product_type exactly", () => {
    expect(matchesCategoryFilters(p, collections, { type: "Candle" })).toBe(true);
    expect(matchesCategoryFilters(p, collections, { type: "Soap" })).toBe(false);
  });
  it("requires ALL selected tags", () => {
    expect(matchesCategoryFilters(p, collections, { tags: ["gift"] })).toBe(true);
    expect(matchesCategoryFilters(p, collections, { tags: ["gift", "winter"] })).toBe(false);
  });
  it("matches ANY selected collection", () => {
    expect(matchesCategoryFilters(p, collections, { collections: ["c2", "c9"] })).toBe(true);
    expect(matchesCategoryFilters(p, collections, { collections: ["c9"] })).toBe(false);
  });
  it("matches category", () => {
    expect(matchesCategoryFilters(p, collections, { category: "Candles" })).toBe(true);
  });
});

describe("resolveGroupKey", () => {
  it("returns empty for none", () => {
    expect(resolveGroupKey(p, collections, "none")).toBe("");
  });
  it("groups by type/category/collection", () => {
    expect(resolveGroupKey(p, collections, "type")).toBe("Candle");
    expect(resolveGroupKey(p, collections, "category")).toBe("Candles");
    expect(resolveGroupKey(p, collections, "collection")).toBe("Best Sellers");
  });
  it("returns Uncategorised for nulls/empties", () => {
    expect(resolveGroupKey({ ...p, product_type: null }, [], "type")).toBe("Uncategorised");
    expect(resolveGroupKey({ ...p, category_name: null }, [], "category")).toBe("Uncategorised");
    expect(resolveGroupKey(p, [], "collection")).toBe("Uncategorised");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/products/grouping.test.ts --pool threads --maxWorkers 1`
Expected: FAIL — cannot find module `./grouping`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/products/grouping.ts`:

```ts
export type CategoryProduct = {
  id: string;
  product_type: string | null;
  tags: string[] | null;
  category_name: string | null;
};

export type ProductCollection = { id: string; title: string };

export type CategoryFilters = {
  type?: string;
  category?: string;
  tags?: string[];
  collections?: string[];
};

export type GroupBy = "none" | "type" | "category" | "collection";

export const UNCATEGORISED = "Uncategorised";

export function matchesCategoryFilters(
  product: CategoryProduct,
  collections: ProductCollection[],
  filters: CategoryFilters
): boolean {
  if (filters.type && product.product_type !== filters.type) return false;
  if (filters.category && product.category_name !== filters.category) return false;

  if (filters.tags && filters.tags.length > 0) {
    const productTags = new Set(product.tags ?? []);
    if (!filters.tags.every((t) => productTags.has(t))) return false;
  }

  if (filters.collections && filters.collections.length > 0) {
    const productCollectionIds = new Set(collections.map((c) => c.id));
    if (!filters.collections.some((id) => productCollectionIds.has(id))) return false;
  }

  return true;
}

export function resolveGroupKey(
  product: CategoryProduct,
  collections: ProductCollection[],
  groupBy: GroupBy
): string {
  switch (groupBy) {
    case "type":
      return product.product_type?.trim() || UNCATEGORISED;
    case "category":
      return product.category_name?.trim() || UNCATEGORISED;
    case "collection":
      return collections[0]?.title?.trim() || UNCATEGORISED;
    case "none":
    default:
      return "";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/products/grouping.test.ts --pool threads --maxWorkers 1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/products/grouping.ts src/lib/products/grouping.test.ts
git commit -m "feat(products): add category filter + grouping pure logic"
```

---

### Task 4: Wire category fields into Shopify sync

**Goal:** Fetch the four fields from Shopify and persist scalars on `product` + collection membership on the join tables.

**Files:**
- Modify: `src/lib/shopify/sync.ts` (query `114-130`, `ShopifyProductNode` `19-26`, `upsertProducts` `75-98`, product-map block `221-234`)

**Acceptance Criteria:**
- [ ] GraphQL query requests `productType`, `tags`, `category { name fullName }`, `collections(first: 50) { nodes { id title handle } }`.
- [ ] Product upsert writes `product_type`, `tags`, `category_name`, `category_full_name`.
- [ ] `shopify_collection` upserted (deduped) and `product_collection` rebuilt per synced product (delete-then-insert).
- [ ] `npx tsc --noEmit` shows no new `src/` errors.

**Verify:** `npx tsc --noEmit` → no new errors under `src/`. (Sync has no unit test harness; correctness of the query is verified by tsc + a real Import in manual QA.)

**Steps:**

- [ ] **Step 1: Extend the GraphQL query** (`sync.ts:118-127`, inside `fetchProducts`)

Replace the `nodes { ... }` block with:

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
          variants(first: 100) {
            nodes { id title sku price }
          }
        }
```

- [ ] **Step 2: Widen the `ShopifyProductNode` type** (`sync.ts:19-26`)

```ts
type ShopifyProductNode = {
  id: string;
  title: string;
  description: string;
  status: string | null;
  featuredImage: { url: string | null } | null;
  productType: string | null;
  tags: string[] | null;
  category: { name: string | null; fullName: string | null } | null;
  collections: { nodes: Array<{ id: string; title: string; handle: string | null }> } | null;
  variants: { nodes: Array<{ id: string; title: string | null; sku: string | null; price: string | null }> };
};
```

- [ ] **Step 3: Extend `upsertProducts` row type and payload** (`sync.ts:75-91`)

Add the four fields to the `rows` param type and spread them through:

```ts
async function upsertProducts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: Array<{
    tenant_id: string;
    shopify_id: string;
    title: string;
    description: string;
    image_url: string | null;
    status: string;
    product_type: string | null;
    tags: string[];
    category_name: string | null;
    category_full_name: string | null;
  }>
): Promise<Map<string, string>> {
```

The existing `.upsert(...).select("id,shopify_id")` body is unchanged — Supabase writes the extra columns from the row objects. (New columns are not in generated types; keep the existing untyped-friendly shape, casting the array to `as never[]` only if tsc complains about the upsert overload — see Step 6.)

- [ ] **Step 4: Populate the upsert payload from the normaliser** (`sync.ts:222-234`)

At the top of `syncShopifyStoreData`, import the helper (with the other imports at `sync.ts:1-7`):

```ts
import { normalizeProductCategories } from "./product-categories";
```

Replace the product-map block:

```ts
  const normalizedByShopifyId = new Map<
    string,
    ReturnType<typeof normalizeProductCategories>
  >();
  for (const product of products) {
    normalizedByShopifyId.set(product.id, normalizeProductCategories(product));
  }

  let productMap = new Map<string, string>();
  if (products.length > 0) {
    productMap = await upsertProducts(
      admin,
      products.map((product) => {
        const cats = normalizedByShopifyId.get(product.id)!;
        return {
          tenant_id: tenantId,
          shopify_id: product.id,
          title: product.title,
          description: product.description,
          image_url: product.featuredImage?.url ?? null,
          status: mapProductStatus(product.status),
          product_type: cats.productType,
          tags: cats.tags,
          category_name: cats.categoryName,
          category_full_name: cats.categoryFullName,
        };
      })
    );
  }
```

- [ ] **Step 5: Sync collections** (new block immediately after the `productMap` assignment, before the `variantRows` block at `sync.ts:236`)

```ts
  // Collections: upsert distinct collections, then rebuild membership per product.
  if (products.length > 0) {
    const collectionByShopifyId = new Map<
      string,
      { tenant_id: string; shopify_id: string; title: string; handle: string | null }
    >();
    for (const cats of normalizedByShopifyId.values()) {
      for (const c of cats.collections) {
        if (!collectionByShopifyId.has(c.shopifyId)) {
          collectionByShopifyId.set(c.shopifyId, {
            tenant_id: tenantId,
            shopify_id: c.shopifyId,
            title: c.title,
            handle: c.handle,
          });
        }
      }
    }

    const collectionIdMap = new Map<string, string>();
    if (collectionByShopifyId.size > 0) {
      const { data: savedCollections, error } = await admin
        .from("shopify_collection")
        .upsert(Array.from(collectionByShopifyId.values()), {
          onConflict: "tenant_id,shopify_id",
        })
        .select("id,shopify_id");
      assertNoError(error, "Failed to upsert shopify_collection");
      for (const row of savedCollections ?? []) {
        collectionIdMap.set(row.shopify_id as string, row.id as string);
      }
    }

    // Rebuild product_collection for every synced product (each appears once).
    const localProductIds = Array.from(productMap.values());
    if (localProductIds.length > 0) {
      const { error: delError } = await admin
        .from("product_collection")
        .delete()
        .eq("tenant_id", tenantId)
        .in("product_id", localProductIds);
      assertNoError(delError, "Failed to clear product_collection");
    }

    const membershipRows: Array<{
      tenant_id: string;
      product_id: string;
      collection_id: string;
    }> = [];
    for (const [shopifyProductId, localProductId] of productMap.entries()) {
      const cats = normalizedByShopifyId.get(shopifyProductId);
      if (!cats) continue;
      for (const c of cats.collections) {
        const localCollectionId = collectionIdMap.get(c.shopifyId);
        if (localCollectionId) {
          membershipRows.push({
            tenant_id: tenantId,
            product_id: localProductId,
            collection_id: localCollectionId,
          });
        }
      }
    }
    if (membershipRows.length > 0) {
      const { error: insError } = await admin
        .from("product_collection")
        .insert(membershipRows);
      assertNoError(insError, "Failed to insert product_collection");
    }
  }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 2 pre-existing `.next/types/validator.ts` errors. If the `.from("shopify_collection")`/`.from("product_collection")` calls error (tables absent from generated types), cast the client: `(admin as any).from("shopify_collection")` — the codebase already uses `as any` for template tables not yet in generated types.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shopify/sync.ts
git commit -m "feat(shopify): sync product_type/tags/category/collections"
```

---

### Task 5: Filter + group-by controls on the products page

**Goal:** Add Type / Tags / Collection / Category filters and a Group-by selector to `ProductFilters`, driven by props and URL params.

**Files:**
- Modify: `src/app/app/products/product-filters.tsx`
- Modify: `src/app/app/products/products.module.css` (filter layout + group-header styles)

**Acceptance Criteria:**
- [ ] Controls render from `facets` props; multi-selects use comma-joined URL params.
- [ ] Changing any control calls `router.replace(url, { scroll: false })` and deletes `page`.
- [ ] Group-by `<select>` sets the `group` param.
- [ ] Styles use design-system tokens only (no hardcoded hex, no invented tokens).

**Verify:** `npx tsc --noEmit` → no new `src/` errors. Manual: controls appear and update the URL.

**Steps:**

- [ ] **Step 1: Rewrite `product-filters.tsx` to accept facet props and render controls**

Replace the file contents:

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import SearchInput from "../_ui/search-input";
import styles from "./products.module.css";

type Props = {
  productTypes: string[];
  categories: string[];
  tags: string[];
  collections: Array<{ id: string; title: string }>;
};

export default function ProductFilters({
  productTypes,
  categories,
  tags,
  collections,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    // Read live search string so we don't clobber an in-flight search debounce.
    const params = new URLSearchParams(window.location.search);
    if (value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleMulti(key: string, value: string, checked: boolean) {
    const params = new URLSearchParams(window.location.search);
    const current = new Set((params.get(key) ?? "").split(",").filter(Boolean));
    if (checked) current.add(value);
    else current.delete(value);
    if (current.size === 0) params.delete(key);
    else params.set(key, Array.from(current).join(","));
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectedTags = new Set((sp.get("tags") ?? "").split(",").filter(Boolean));
  const selectedCollections = new Set(
    (sp.get("collection") ?? "").split(",").filter(Boolean)
  );

  return (
    <div className={styles.filters}>
      <SearchInput param="q" placeholder="Search by name or SKU" ariaLabel="Search by name or SKU" />

      <select
        aria-label="Filter products by status"
        value={sp.get("status") ?? "all"}
        onChange={(e) => setParam("status", e.target.value)}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="draft">Draft</option>
        <option value="archived">Archived</option>
      </select>

      {productTypes.length > 0 && (
        <select
          aria-label="Filter by product type"
          value={sp.get("type") ?? "all"}
          onChange={(e) => setParam("type", e.target.value)}
        >
          <option value="all">All types</option>
          {productTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}

      {categories.length > 0 && (
        <select
          aria-label="Filter by category"
          value={sp.get("category") ?? "all"}
          onChange={(e) => setParam("category", e.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      <select
        aria-label="Group products by"
        value={sp.get("group") ?? "none"}
        onChange={(e) => setParam("group", e.target.value)}
      >
        <option value="none">No grouping</option>
        <option value="type">Group by type</option>
        <option value="category">Group by category</option>
        <option value="collection">Group by collection</option>
      </select>

      {(tags.length > 0 || collections.length > 0) && (
        <details className={styles.multiFilter}>
          <summary>More filters</summary>
          <div className={styles.multiFilterBody}>
            {tags.length > 0 && (
              <fieldset className={styles.multiGroup}>
                <legend>Tags</legend>
                {tags.map((t) => (
                  <label key={t} className={styles.checkOption}>
                    <input
                      type="checkbox"
                      checked={selectedTags.has(t)}
                      onChange={(e) => toggleMulti("tags", t, e.target.checked)}
                    />
                    {t}
                  </label>
                ))}
              </fieldset>
            )}
            {collections.length > 0 && (
              <fieldset className={styles.multiGroup}>
                <legend>Collections</legend>
                {collections.map((c) => (
                  <label key={c.id} className={styles.checkOption}>
                    <input
                      type="checkbox"
                      checked={selectedCollections.has(c.id)}
                      onChange={(e) => toggleMulti("collection", c.id, e.target.checked)}
                    />
                    {c.title}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add styles** to `src/app/app/products/products.module.css` (append; use tokens only)

```css
.multiFilter {
  position: relative;
  font-size: var(--fs-sm);
}
.multiFilter summary {
  cursor: pointer;
  color: var(--ink-muted);
  padding: 8px 12px;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  list-style: none;
}
.multiFilterBody {
  position: absolute;
  z-index: 10;
  margin-top: 6px;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  gap: 20px;
}
.multiGroup {
  border: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.multiGroup legend {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
}
.checkOption {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-strong);
  white-space: nowrap;
}
.groupHeader {
  padding: 10px 16px;
  background: var(--bg-card-alt);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
  border-top: 1px solid var(--stroke);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `product-filters.tsx` will error at its usage site in `page.tsx` (missing props) until Task 6 — that is expected; verify no OTHER new errors. (This task and Task 6 land together conceptually; commit both before final tsc.)

- [ ] **Step 4: Commit**

```bash
git add src/app/app/products/product-filters.tsx src/app/app/products/products.module.css
git commit -m "feat(products): add category filter + group-by controls"
```

---

### Task 6: Apply filters + grouping in the products page

**Goal:** Fetch collections, compute facets, apply the new filters, render group headers, and pass facet props to `ProductFilters` — all with graceful degradation when the patch is unapplied.

**Files:**
- Modify: `src/app/app/products/page.tsx` (`ProductRow` type `15-22`, product select `224-290`, `filteredProducts` `317-332`, render `369-455`, `searchParams` type `62-74`)

**Acceptance Criteria:**
- [ ] Products query selects the new columns; existing fallback cascade still runs if they're absent, defaulting them to null/`[]`.
- [ ] Collections fetched via `fetchAllRows`; `collectionsByProduct` built.
- [ ] `ProductFilters` receives `productTypes/categories/tags/collections` props.
- [ ] New filters applied; when `group !== none`, rows sorted so groups are contiguous and a group header renders when the key changes.
- [ ] `npx tsc --noEmit` → no new `src/` errors.

**Verify:** `npx tsc --noEmit` → clean under `src/`. `npx vitest run --pool threads --maxWorkers 1` → only baseline failures.

**Steps:**

- [ ] **Step 1: Extend `ProductRow` and `searchParams` types** (`page.tsx:15-22`, `62-74`)

Add to `ProductRow`:

```ts
type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  created_at?: string | null;
  image_url: string | null;
  status: string;
  product_type: string | null;
  tags: string[] | null;
  category_name: string | null;
};
```

Add to the `searchParams` promise type: `type?: string; tags?: string; collection?: string; category?: string; group?: string;`.

- [ ] **Step 2: Parse the new params** (after `page.tsx:80`)

```ts
  const typeFilter = (params.type ?? "").trim();
  const categoryFilter = (params.category ?? "").trim();
  const tagsFilter = (params.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const collectionFilter = (params.collection ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const groupBy = (["none", "type", "category", "collection"].includes(params.group ?? "")
    ? params.group
    : "none") as import("@/lib/products/grouping").GroupBy;
```

- [ ] **Step 3: Select new columns in the primary products query** (`page.tsx:224-228`)

```ts
  const detailedProductsResult = await supabase
    .from("product")
    .select("id,title,description,created_at,image_url,status,product_type,tags,category_name,category_full_name")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
```

In the success branch (`page.tsx:288-289`), the rows already carry the new fields. In EACH fallback branch that builds `products` (the `.map(...)` blocks at `241`, `251`, `263`, `277`), add the defaults so the shape stays consistent:

```ts
        product_type: null,
        tags: [],
        category_name: null,
```

(Add these three keys to every fallback `.map` object literal. The primary success branch needs no change.)

- [ ] **Step 4: Fetch collections + build `collectionsByProduct`** (after the products block, before `filteredProducts` at `page.tsx:317`)

```ts
  type CollectionMembershipRow = {
    product_id: string;
    collection_id: string;
    shopify_collection: { id: string; title: string } | { id: string; title: string }[] | null;
  };
  const membershipResult = await fetchAllRows<CollectionMembershipRow>((from, to) =>
    supabase
      .from("product_collection")
      .select("product_id,collection_id,shopify_collection:collection_id(id,title)")
      .eq("tenant_id", tenantId)
      .range(from, to)
  );
  const collectionsByProduct = new Map<string, Array<{ id: string; title: string }>>();
  if (!membershipResult.error) {
    for (const row of membershipResult.data ?? []) {
      const coll = Array.isArray(row.shopify_collection)
        ? row.shopify_collection[0] ?? null
        : row.shopify_collection;
      if (!coll) continue;
      const list = collectionsByProduct.get(row.product_id) ?? [];
      list.push({ id: coll.id, title: coll.title });
      collectionsByProduct.set(row.product_id, list);
    }
  }
```

(If `product_collection` doesn't exist yet, `membershipResult.error` is truthy and the map stays empty — graceful degradation.)

- [ ] **Step 5: Build facets** (after Step 4)

```ts
  const { buildFacets } = await import("@/lib/products/facets");
  const facets = buildFacets(products, collectionsByProduct);
```

(Or add a top-of-file `import { buildFacets } from "@/lib/products/facets";` — prefer the static import.)

- [ ] **Step 6: Apply the new filters** — extend the `filteredProducts` predicate (`page.tsx:317-332`)

Add a static import at the top: `import { matchesCategoryFilters } from "@/lib/products/grouping";`
Then inside the `.filter` callback, before `return true;`:

```ts
    if (
      !matchesCategoryFilters(
        product,
        collectionsByProduct.get(product.id) ?? [],
        {
          type: typeFilter || undefined,
          category: categoryFilter || undefined,
          tags: tagsFilter.length ? tagsFilter : undefined,
          collections: collectionFilter.length ? collectionFilter : undefined,
        }
      )
    ) {
      return false;
    }
```

- [ ] **Step 7: Group the rows** — after `sortProductRows` (`page.tsx:360`)

The `rows`/`sortedRows` are derived objects lacking category fields. Add the group key when building `rows` (`page.tsx:348-357`), pulling from the source product:

```ts
      groupKey: resolveGroupKey(
        product,
        collectionsByProduct.get(product.id) ?? [],
        groupBy
      ),
```

Add the static import: `import { resolveGroupKey } from "@/lib/products/grouping";` (same module as Step 6 — combine into one import).

When `groupBy !== "none"`, stable-sort `sortedRows` by `groupKey` so groups are contiguous (after the existing sort):

```ts
  const groupedRows =
    groupBy === "none"
      ? sortedRows
      : [...sortedRows].sort((a, b) => a.groupKey.localeCompare(b.groupKey));
```

Use `groupedRows` for pagination instead of `sortedRows` (`page.tsx:361-364`): replace `sortedRows` with `groupedRows` in the `totalFiltered`/`pagedRows` lines.

- [ ] **Step 8: Render group headers** — in the rows map (`page.tsx:411-451`)

Track the previous group key and emit a header when it changes. Replace the `pagedRows.map((row) => (...))` with:

```tsx
          (() => {
            let lastGroup: string | null = null;
            return pagedRows.map((row) => {
              const showHeader = groupBy !== "none" && row.groupKey !== lastGroup;
              lastGroup = row.groupKey;
              return (
                <div key={row.id}>
                  {showHeader && (
                    <div className={styles.groupHeader}>{row.groupKey}</div>
                  )}
                  <div className={styles.tableRow}>
                    {/* ...existing row cells unchanged... */}
                  </div>
                </div>
              );
            });
          })()
```

Keep the existing cell markup (`productCell`, `variantCount`, `statusBadge`, `sellPriceCell`, `gpCell`) exactly as-is inside `.tableRow`.

- [ ] **Step 9: Pass facet props to `ProductFilters`** (`page.tsx:395`)

```tsx
      <ProductFilters
        productTypes={facets.productTypes}
        categories={facets.categories}
        tags={facets.tags}
        collections={facets.collections}
      />
```

- [ ] **Step 10: Typecheck + tests**

Run: `npx tsc --noEmit` → clean under `src/`.
Run: `npx vitest run --pool threads --maxWorkers 1` → only the 2 baseline failures.

- [ ] **Step 11: Commit**

```bash
git add src/app/app/products/page.tsx
git commit -m "feat(products): filter and group by Shopify categories"
```

---

### Task 7: Update QA feature test plan

**Goal:** Document the new feature and its testable behaviours per CLAUDE.md.

**Files:**
- Modify: `docs/qa-feature-test-plan.md` (Products domain section + `## Changelog`)

**Acceptance Criteria:**
- [ ] New checklist entry under the Products domain matching existing format (entry point, what it does, `- [ ]` checks).
- [ ] Dated changelog line appended.

**Verify:** Manual review — the entry matches surrounding format.

**Steps:**

- [ ] **Step 1: Add the feature checklist** under the Products domain section:

```markdown
### Product categories & filters

Entry point: `/app/products`. Shopify sync captures product type, tags, Standard-Taxonomy
category, and collection membership (read-only). The filter bar can filter and group by them.

- [ ] Importing from Shopify populates product type, tags, category, and collections.
- [ ] Filter by product type narrows the list to that type.
- [ ] Filter by category narrows the list to that category.
- [ ] Selecting one or more tags shows only products carrying ALL selected tags.
- [ ] Selecting one or more collections shows products in ANY selected collection.
- [ ] Group by type / category / collection inserts section headers; null values group under "Uncategorised".
- [ ] With the DB patch unapplied, the page still renders and category filters simply show no options.
```

- [ ] **Step 2: Append a changelog line** to the `## Changelog` section:

```markdown
- 2026-07-01 — added product categories & filters: sync Shopify product_type/tags/category/collections, filter and group the products page by them.
```

- [ ] **Step 3: Commit**

```bash
git add docs/qa-feature-test-plan.md
git commit -m "docs(qa): add product categories & filters to test plan"
```

---

## Deploy checklist

1. Apply `supabase/patches/product_categories.sql` to the database **before** deploying code.
2. Confirm `super_admin_foundation.sql` re-run (or manual policy apply) covers the two new tables.
3. Trigger a Shopify sync ("Import Products" or a product webhook) to backfill.
4. Verify filters populate on `/app/products`.

## Task dependency graph

- Task 0 (schema) — no deps.
- Tasks 1, 2, 3 (pure modules) — no deps; can run in parallel.
- Task 4 (sync) — depends on 0, 1.
- Task 5 (filter UI) — depends on 2 (facet shape), 3 (GroupBy type).
- Task 6 (page) — depends on 0, 2, 3, 5.
- Task 7 (docs) — depends on 4, 6.
