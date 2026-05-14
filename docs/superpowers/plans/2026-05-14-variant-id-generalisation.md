# Variant ID Generalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `shopify_product` → `product` and `shopify_variant` → `product_variant`, make `shopify_id` nullable, add a `source` text column gated by a CHECK constraint, and update every code reference so non-Shopify tenants can hold products / variants / BOMs.

**Architecture:** Single-transaction SQL patch performs the rename + column changes + back-fill of `source = 'shopify'` for pre-existing rows. The patch ships in the same release window as a mechanical code-side rename (~10 TS/TSX files, 2 `.mjs` scripts, plus the canonical `schema.sql` doc). Shopify webhook sync explicitly writes `source: 'shopify'`; everything else defaults to `'manual'`. Existing pre-rename SQL patches are left untouched — they describe the schema at their point in time, and the rename patch lives forward of them in the patch chain.

**Tech Stack:** Postgres (Supabase, remote-only — no local stack), TypeScript, Next.js 15 App Router, Supabase JS client, Vitest. Spec: `docs/superpowers/specs/2026-05-13-variant-id-generalisation-design.md`.

---

## File Structure

**New:**
- `supabase/patches/generalize_variant_schema.sql` — the migration patch.

**Modified (schema doc):**
- `supabase/schema.sql:203-307` — update table definitions to match post-migration state.

**Modified (Shopify sync — must set `source: 'shopify'`):**
- `src/lib/shopify/sync.ts:60-97` — rename `upsertShopifyProducts`, drop the `isMissingShopifyProductColumn` fallback (the renamed column situation is past us; we control the schema now), write `source: 'shopify'` on both product and variant upserts, target `product` / `product_variant`.
- `src/lib/shopify/sync.ts:216-253` — read-back queries use new table names.

**Modified (mechanical rename only — table strings change, columns and shapes do not):**
- `src/app/app/bom/page.tsx:62` — `shopify_variant` → `product_variant`.
- `src/app/app/products/page.tsx:72,77,192,202,212,224` — both tables.
- `src/app/app/products/[productId]/page.tsx:92,103` — both tables.
- `src/app/app/products/variants/[variantId]/page.tsx:184` — `product_variant`.
- `src/app/app/products/actions.ts:105,188,238,339` — `product_variant`.
- `src/app/app/reports/export/route.ts:74` — `product_variant`.
- `src/app/app/_dashboard/widgets/bom-health.tsx:14` — `product_variant`.
- `scripts/reset_tenant_data.mjs:123-124,186,211` — both tables (note: this file enumerates tables in cascade-delete order; order matters).
- `scripts/seed_pac_catalog_and_boms.mjs:1133,1143` — both tables; insert must also pass `source: 'manual'` since the seed is creating non-Shopify data (currently the script depends on Shopify connection — verify before changing).

**Not modified (intentional per spec §"Code change surface"):**
- `supabase/patches/bom_builder_redesign_schema.sql`, `dashboard_compat_views.sql`, `multi_tenant_access_and_super_admin.sql`, `shopify_app_patch.sql`, `shopify_product_description.sql`, `seed.sql` — these patches describe historic schema state. They are not re-run.

---

## Task 1: Author the migration patch

**Files:**
- Create: `supabase/patches/generalize_variant_schema.sql`

- [ ] **Step 1: Write the migration patch**

Create `supabase/patches/generalize_variant_schema.sql` with exactly this content:

```sql
-- Generalize product/variant tables so non-Shopify tenants can own products,
-- variants, and BOMs. Renames shopify_product -> product and
-- shopify_variant -> product_variant, makes shopify_id nullable, adds a
-- `source` column gated by a CHECK constraint that requires shopify_id iff
-- the row originated from Shopify.

begin;

alter table public.shopify_product  rename to product;
alter table public.shopify_variant  rename to product_variant;

alter table public.product          alter column shopify_id drop not null;
alter table public.product_variant  alter column shopify_id drop not null;

alter table public.product          add column source text not null default 'manual';
alter table public.product_variant  add column source text not null default 'manual';

-- Every pre-existing row came from Shopify sync (only create path before today).
update public.product          set source = 'shopify' where shopify_id is not null;
update public.product_variant  set source = 'shopify' where shopify_id is not null;

alter table public.product
  add constraint product_source_shopify_id_chk
  check ((source = 'shopify' and shopify_id is not null)
      or (source <> 'shopify' and shopify_id is null));

alter table public.product_variant
  add constraint product_variant_source_shopify_id_chk
  check ((source = 'shopify' and shopify_id is not null)
      or (source <> 'shopify' and shopify_id is null));

commit;
```

- [ ] **Step 2: Commit the patch on its own**

```bash
git add supabase/patches/generalize_variant_schema.sql
git commit -m "feat(schema): patch to generalize product/variant tables"
```

---

## Task 2: Dry-run the patch on a Supabase branch

Verifies the patch parses, the rename succeeds, and constraint behaviour matches spec §Testing — before touching production.

**Files:** none modified locally.

- [ ] **Step 1: Create a Supabase branch**

Use the Supabase MCP tool `mcp__plugin_supabase_supabase__create_branch` with `name: "generalize-variant-schema-dryrun"`. Capture the returned `project_ref`.

- [ ] **Step 2: Apply the patch to the branch**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: the branch project_ref from Step 1
- `name`: `generalize_variant_schema`
- `query`: the full contents of `supabase/patches/generalize_variant_schema.sql`

Expected: no error.

- [ ] **Step 3: Confirm both renames landed**

Run `mcp__plugin_supabase_supabase__execute_sql` against the branch:

```sql
select to_regclass('public.product')          as product,
       to_regclass('public.product_variant')  as product_variant,
       to_regclass('public.shopify_product')  as old_product,
       to_regclass('public.shopify_variant')  as old_variant;
```

Expected: `product` and `product_variant` non-null; `old_product` and `old_variant` null.

- [ ] **Step 4: Constraint test — manual row with shopify_id is rejected**

```sql
-- Use any real tenant id from the branch. Replace <TENANT_ID> below.
insert into public.product (tenant_id, shopify_id, title, source)
values ('<TENANT_ID>', 'gid://shopify/Product/999', 'should fail', 'manual');
```

Expected: error mentioning `product_source_shopify_id_chk`.

- [ ] **Step 5: Constraint test — shopify row without shopify_id is rejected**

```sql
insert into public.product (tenant_id, shopify_id, title, source)
values ('<TENANT_ID>', null, 'should fail', 'shopify');
```

Expected: error mentioning `product_source_shopify_id_chk`.

- [ ] **Step 6: Constraint test — manual row with null shopify_id succeeds**

```sql
insert into public.product (tenant_id, shopify_id, title, source)
values ('<TENANT_ID>', null, 'manual ok', 'manual')
returning id;
```

Expected: a row id returned.

- [ ] **Step 7: Constraint test — shopify row with shopify_id succeeds**

```sql
insert into public.product (tenant_id, shopify_id, title, source)
values ('<TENANT_ID>', 'gid://shopify/Product/test-1', 'shopify ok', 'shopify')
returning id;
```

Expected: a row id returned.

- [ ] **Step 8: Back-fill smoke check — all pre-existing rows tagged as Shopify**

```sql
select source, shopify_id is null as null_shopify_id, count(*)
from public.product
group by 1, 2 order by 1, 2;
```

Expected: every row with `shopify_id is null = false` has `source = 'shopify'`; the only `source = 'manual'` rows are the ones inserted in Step 6.

Repeat for `public.product_variant`.

- [ ] **Step 9: Delete the branch**

`mcp__plugin_supabase_supabase__delete_branch` with the branch's id. (No code commit for this task — it's verification only.)

---

## Task 3: Update Shopify sync to write `source: 'shopify'`

**Files:**
- Modify: `src/lib/shopify/sync.ts`

- [ ] **Step 1: Drop the `isMissingShopifyProductColumn` fallback and rename the helper**

Open `src/lib/shopify/sync.ts`. Replace lines 60-97 (the `isMissingShopifyProductColumn` function plus the entire `upsertShopifyProducts` function) with:

```ts
async function upsertProducts(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  rows: Array<{
    tenant_id: string;
    shopify_id: string;
    title: string;
    description: string;
    image_url: string | null;
  }>
) {
  const sourcedRows = rows.map((row) => ({ ...row, source: "shopify" as const }));
  const { error } = await admin
    .from("product")
    .upsert(sourcedRows, { onConflict: "tenant_id,shopify_id" });
  assertNoError(error, "Failed to upsert product");
}
```

Rationale for dropping the fallback: it existed to tolerate older schemas without the `description` / `image_url` columns. Post-migration the schema is fixed forward, and `source` is a required column — the fallback would silently drop it.

- [ ] **Step 2: Rename the caller**

Around line 200 (was `await upsertShopifyProducts(`), change the call to `await upsertProducts(`.

- [ ] **Step 3: Update the product read-back query**

Around line 216, change `.from("shopify_product")` to `.from("product")`. Update the surrounding error message string from `"Failed to fetch saved shopify_product rows"` to `"Failed to fetch saved product rows"`.

- [ ] **Step 4: Update the variant upsert to include `source`**

Around line 224, the `variantRows` array is built. Add `source: "shopify" as const` to each row literal. Replace the block (was lines 224-235):

```ts
  const variantRows = products.flatMap((product) =>
    product.variants.nodes
      .map((variant) => ({
        tenant_id: tenantId,
        product_id: productMap.get(product.id) ?? "",
        shopify_id: variant.id,
        title: variant.title ?? "",
        sku: variant.sku,
        price: variant.price ? parseFloat(variant.price) : null,
        source: "shopify" as const,
      }))
      .filter((variant) => variant.product_id)
  );
```

- [ ] **Step 5: Rename the variant upsert and read-back queries**

Around line 238: `.from("shopify_variant").upsert(...)` → `.from("product_variant").upsert(...)`. Update the error string from `"Failed to upsert shopify_variant"` to `"Failed to upsert product_variant"`.

Around line 248: `.from("shopify_variant").select(...)` → `.from("product_variant").select(...)`. Update the error string from `"Failed to fetch saved shopify_variant rows"` to `"Failed to fetch saved product_variant rows"`.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in `src/lib/shopify/sync.ts`. (If pre-existing errors elsewhere exist, they should be unchanged.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/shopify/sync.ts
git commit -m "feat(shopify): write source='shopify' and use renamed product/product_variant tables"
```

---

## Task 4: Mechanical rename across read-only call sites

These files only read from the renamed tables. The columns and result shapes are identical — only the table-name string changes.

**Files:**
- Modify: `src/app/app/bom/page.tsx`
- Modify: `src/app/app/products/page.tsx`
- Modify: `src/app/app/products/[productId]/page.tsx`
- Modify: `src/app/app/products/variants/[variantId]/page.tsx`
- Modify: `src/app/app/reports/export/route.ts`
- Modify: `src/app/app/_dashboard/widgets/bom-health.tsx`

- [ ] **Step 1: Replace `shopify_variant` with `product_variant` in each file**

In each of:
- `src/app/app/bom/page.tsx`
- `src/app/app/products/variants/[variantId]/page.tsx`
- `src/app/app/reports/export/route.ts`
- `src/app/app/_dashboard/widgets/bom-health.tsx`

Replace every occurrence of `"shopify_variant"` with `"product_variant"`. Use the Edit tool with `replace_all: true` per file.

- [ ] **Step 2: Replace both tables in the product pages**

In `src/app/app/products/page.tsx`, replace every `"shopify_variant"` with `"product_variant"` and every `"shopify_product"` with `"product"`.

In `src/app/app/products/[productId]/page.tsx`, do the same.

- [ ] **Step 3: Verify no occurrences remain in these files**

Use Grep with pattern `shopify_product|shopify_variant` scoped to:

```
src/app/app/bom/page.tsx
src/app/app/products/page.tsx
src/app/app/products/[productId]/page.tsx
src/app/app/products/variants/[variantId]/page.tsx
src/app/app/reports/export/route.ts
src/app/app/_dashboard/widgets/bom-health.tsx
```

Expected: zero matches.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in the touched files.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/bom/page.tsx src/app/app/products/page.tsx \
  src/app/app/products/[productId]/page.tsx \
  src/app/app/products/variants/[variantId]/page.tsx \
  src/app/app/reports/export/route.ts \
  src/app/app/_dashboard/widgets/bom-health.tsx
git commit -m "refactor(products): rename shopify_product/shopify_variant table refs to product/product_variant"
```

---

## Task 5: Update `actions.ts` (read + write surface)

**Files:**
- Modify: `src/app/app/products/actions.ts`

This file inserts/updates against `shopify_variant`. Inserts must remain Shopify-sourced because today the only create path is the Shopify webhook — actions.ts only mutates existing rows. Confirm by inspection before editing.

- [ ] **Step 1: Inspect each call site**

Read `src/app/app/products/actions.ts` at lines 100-115, 180-200, 230-250, 330-350. For each `.from("shopify_variant")` call, note whether it's a `.select(...)`, `.update(...)`, `.insert(...)`, or `.upsert(...)`.

Expected outcome: all four call sites are reads/updates of existing rows (no `.insert` of new variants). If any call site does insert a new variant, **stop and flag it** — that insert needs a `source` value and the spec must be revisited.

- [ ] **Step 2: Replace table name in actions.ts**

Replace every occurrence of `"shopify_variant"` with `"product_variant"` (Edit with `replace_all: true`).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/products/actions.ts
git commit -m "refactor(products): rename shopify_variant table ref in actions"
```

---

## Task 6: Update `.mjs` scripts

**Files:**
- Modify: `scripts/reset_tenant_data.mjs`
- Modify: `scripts/seed_pac_catalog_and_boms.mjs`

- [ ] **Step 1: Inspect `seed_pac_catalog_and_boms.mjs` insert sites**

Read `scripts/seed_pac_catalog_and_boms.mjs` lines 1125-1160. The script inserts seed product/variant rows for the PAC tenant.

Determine: is the script seeding *Shopify-origin* data (with a real `shopify_id`) or *manual* data?

- If `shopify_id` values are set to real Shopify GIDs → keep `source: 'shopify'`.
- If `shopify_id` is null / absent / a placeholder → set `source: 'manual'` and ensure `shopify_id` is `null`.

Apply the matching `source` literal to both the product and variant inserts.

- [ ] **Step 2: Rename tables in `seed_pac_catalog_and_boms.mjs`**

Replace `"shopify_product"` with `"product"` and `"shopify_variant"` with `"product_variant"`.

- [ ] **Step 3: Update `reset_tenant_data.mjs`**

Read `scripts/reset_tenant_data.mjs` lines 115-220. The script lists tables to truncate per tenant.

In the table-list literals (around lines 123-124 and the cascading reset block), replace:
- `"shopify_variant"` → `"product_variant"`
- `"shopify_product"` → `"product"`

Also update the count keys around line 186 and the return-shape keys around line 211 (`shopify_product:` → `product:`).

- [ ] **Step 4: Sanity-check there are no remaining old names anywhere in scripts**

Grep `shopify_product|shopify_variant` over `scripts/`. Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add scripts/reset_tenant_data.mjs scripts/seed_pac_catalog_and_boms.mjs
git commit -m "refactor(scripts): rename product/variant table refs in tenant reset and PAC seed"
```

---

## Task 7: Update the canonical `schema.sql`

`schema.sql` is the human-readable reference, not the applied source of truth. Keeping it in sync makes onboarding and audits accurate.

**Files:**
- Modify: `supabase/schema.sql:203-307`

- [ ] **Step 1: Rewrite the two table definitions**

In `supabase/schema.sql`, replace the existing `shopify_product` definition (around lines 203-212) with:

```sql
create table public.product (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_id text,
  title text not null,
  description text,
  image_url text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id),
  constraint product_source_shopify_id_chk
    check ((source = 'shopify' and shopify_id is not null)
        or (source <> 'shopify' and shopify_id is null))
);
```

Replace the existing `shopify_variant` definition (around lines 214-223) with:

```sql
create table public.product_variant (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  product_id uuid not null references public.product(id),
  shopify_id text,
  title text,
  sku text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id),
  constraint product_variant_source_shopify_id_chk
    check ((source = 'shopify' and shopify_id is not null)
        or (source <> 'shopify' and shopify_id is null))
);
```

- [ ] **Step 2: Update FK references in the same file**

At line 228 (`product_bom.variant_id`): change `references public.shopify_variant(id)` to `references public.product_variant(id)`.

At line 301 (`order_line.variant_id`): change `references public.shopify_variant(id)` to `references public.product_variant(id)`.

- [ ] **Step 3: Update RLS / grant table lists referencing old names**

Around lines 578-579 (`'shopify_product', 'shopify_variant',`) — replace with `'product', 'product_variant',`.

Note: the older `multi_tenant_access_and_super_admin.sql` patch has its own list at lines 140-141 — per spec §"Code change surface", that patch is *not* rewritten.

- [ ] **Step 4: Verify no stale references**

Grep `shopify_product|shopify_variant` over `supabase/schema.sql`. Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql
git commit -m "docs(schema): update canonical schema.sql to product/product_variant"
```

---

## Task 8: Full verification before release

**Files:** none modified.

- [ ] **Step 1: Repo-wide grep for stale references**

Grep `shopify_product|shopify_variant` across the entire repo, **excluding** `node_modules`, `.next`, `.npm-cache`, `.worktrees`, `docs/`, `archive/`, and the intentionally-untouched SQL patches listed in the spec.

Expected matches: only inside the intentionally-skipped files (`supabase/patches/bom_builder_redesign_schema.sql`, `dashboard_compat_views.sql`, `multi_tenant_access_and_super_admin.sql`, `shopify_app_patch.sql`, `shopify_product_description.sql`, `seed.sql`) and the spec/plan docs themselves.

If any other file matches, stop and update it.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors introduced by this work (pre-existing errors unrelated to product/variant rename are acceptable but flag them).

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: no new failures. (Two pre-existing failures — allocation engine + inventory invariants — are tracked in memory and not part of this work.)

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Stop — do not apply the migration to production yet**

The patch is in `supabase/patches/generalize_variant_schema.sql` and verified on a branch (Task 2). Production application is a release-window operation: apply the patch and deploy the code in the same window because any old-code request hitting the renamed schema will 500.

Report to the user:
- All code changes committed and verified.
- Migration patch reviewed on a Supabase branch with all four constraint tests passing.
- Ready to coordinate the release window: apply `generalize_variant_schema.sql` to production, then promote the deployment.

---

## Acceptance criteria mapping (from spec §Acceptance criteria)

- **"A new tenant can create a BOM without connecting Shopify."** — satisfied by the schema change (Task 1, verified Task 2 Step 6) + the CSV wizard insert path (separate spec, gated by this plan).
- **"Existing Shopify-connected BOMs work unchanged after migration."** — satisfied by the back-fill in Task 1 (every pre-existing row tagged `source = 'shopify'`) + Task 8 full-stack verification. No FK rewiring because the FKs follow the rename transparently.
- **"CSV wizard can create BOMs against imported variants without any Shopify dependency."** — satisfied by `shopify_id` being nullable post-migration and the CHECK constraint allowing `source <> 'shopify'` with `shopify_id IS NULL`.
