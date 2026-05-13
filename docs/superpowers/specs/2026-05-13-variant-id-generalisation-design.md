# Variant ID Generalisation — Design Spec

**Date:** 2026-05-13
**Scope:** Decouple `product_bom.variant_id` and `order_line.variant_id` from the Shopify-specific `shopify_variant` table so non-Shopify tenants (CSV-wizard migrations from Craftybase, Katana, Cin7) can hold products, variants, and BOMs.
**Status:** Approved by user, ready for implementation plan.
**Source:** Gap #2 in `docs/_audit/schema-gaps-2026-05-13.md`. Gates the migration CSV wizard (`docs/superpowers/specs/2026-05-13-migration-csv-wizard.md`) and the entire defector funnel in the 90-day GTM plan.

## Problem

`product_bom.variant_id` and `order_line.variant_id` both `references public.shopify_variant(id)`. `shopify_variant` requires a non-null `shopify_id` and a parent row in `shopify_product`, which also requires a `shopify_id`. A tenant that hasn't connected Shopify therefore cannot:

- Create a BOM (FK constraint refuses).
- Be receive-targeted by the CSV wizard (no variant rows to bind BOMs to).
- Place an order line (same FK).

The audit doc surfaces this as the highest-ROI schema gap because it blocks the entire CSV-wizard motion.

## Goals

- The schema permits a tenant to hold products, variants, BOMs, and order lines without any Shopify row — the CSV wizard is the v1 create path.
- Existing Shopify-connected BOMs keep working after migration — no FK breakage, no data loss.
- The CSV wizard can land Craftybase / Katana / Cin7 imports against the same variant table the Shopify webhook writes to.
- The schema makes the data's origin explicit (`source` column) so future imports, reports, and merge flows can branch on it.

## Non-goals (v1)

- No manual UI for creating products / variants outside the CSV wizard. CRUD UI is a separate spec.
- No `external_source` / `external_id` traceability columns. Add when re-import or Shopify-merge ships.
- No SKU uniqueness rules across manual + Shopify variants. Whatever exists today is left alone.
- No flow to merge a manual variant with a later-connected Shopify variant. Separate spec.
- No enum type for `source`. Plain `text` is more flexible and equally indexable.

## Data model

Rename both tables and loosen the Shopify-specific columns:

| Before                  | After             |
| ----------------------- | ----------------- |
| `shopify_product`       | `product`         |
| `shopify_variant`       | `product_variant` |

New / changed columns on each of `product` and `product_variant`:

- `source text not null default 'manual'` — origin marker. Allowed values in v1: `'shopify'`, `'manual'`, `'csv_craftybase'`, `'csv_katana'`, `'csv_cin7'`. Plain `text`; new values do not require an `ALTER TYPE`.
- `shopify_id text` — made nullable (was `not null`).

New constraints on each table:

- `CHECK ((source = 'shopify' AND shopify_id IS NOT NULL) OR (source <> 'shopify' AND shopify_id IS NULL))` — `shopify_id` is present iff the row is Shopify-sourced.

Preserved as-is:

- `UNIQUE (tenant_id, shopify_id)` — Postgres treats NULLs as distinct, so manual rows coexist freely.
- All three existing FK references (`shopify_variant.product_id`, `product_bom.variant_id`, `order_line.variant_id`) follow the rename transparently. No FK rewiring needed.

### Migration SQL

Single patch file, single transaction:

```sql
-- supabase/patches/generalize_variant_schema.sql

begin;

alter table public.shopify_product   rename to product;
alter table public.shopify_variant   rename to product_variant;

alter table public.product          alter column shopify_id drop not null;
alter table public.product_variant  alter column shopify_id drop not null;

alter table public.product          add column source text not null default 'manual';
alter table public.product_variant  add column source text not null default 'manual';

-- Every pre-existing row came from Shopify sync.
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

If anything goes wrong before `commit`, `rollback` reverses the entire change.

## Migration mechanics

- **Cutover model:** the DB patch and the code PR ship together in a single release window. Brief unavailability is acceptable (no paying tenants with live Shopify webhooks at time of migration — confirmed in brainstorm). No double-write window, no compatibility view.
- **Release sequence within the window:** apply the DB patch, then deploy the code containing the renamed table references. The window between the two must be short because any old-code request hitting the renamed schema will 500 on missing `shopify_variant` / `shopify_product`.
- **Reversibility:** the patch is fully reversible until `commit`. Post-deploy reversal requires renaming back, dropping `source`, and re-deploying the prior code.

## Code change surface

- **Generated Supabase types** — regenerate from the new schema. Affects every file that imports table types.
- **Shopify webhook** (`src/lib/shopify/sync.ts`) — `upsertShopifyProducts` and the variant upsert target `product` / `product_variant` and explicitly set `source: 'shopify'`. The `onConflict: "tenant_id,shopify_id"` keys are unchanged.
- **CSV wizard** (per the migration-csv-wizard spec) — inserts rows with `source: 'csv_craftybase' | 'csv_katana' | 'csv_cin7' | 'manual'` and `shopify_id: null`. Uses the same table; no special-casing required at the data layer.
- **Read paths** — every `from('shopify_product')` / `from('shopify_variant')` becomes `from('product')` / `from('product_variant')`. Grep identified ~32 TS/TSX files; the change is mechanical.
- **Existing SQL patches** that reference the old table names (`dashboard_compat_views.sql`, `bom_builder_redesign_schema.sql`, `multi_tenant_access_and_super_admin.sql`, `shopify_app_patch.sql`, `shopify_product_description.sql`, `seed.sql`) are **not rewritten**. They reflect the schema at their point in time; the rename patch lives forward of them in the patch chain.

## Testing

- **Constraint tests** — assert that:
  - `insert ... source='manual', shopify_id='gid://...'` is rejected.
  - `insert ... source='shopify', shopify_id=null` is rejected.
  - `insert ... source='manual', shopify_id=null` succeeds.
  - `insert ... source='shopify', shopify_id='gid://shopify/Variant/123'` succeeds.
- **Shopify webhook test** — existing Shopify sync flow lands a row with `source='shopify'` and the expected `shopify_id`.
- **Manual variant test** — insert a manual `product` + `product_variant`, bind a `product_bom`, run an allocation, confirm the BOM editor reads it correctly with no Shopify dependency.
- **Smoke test** — post-migration, `select count(*) from product_variant` equals the pre-migration count of `shopify_variant`. Same for `product`.

## Risks

- **Mechanical breadth.** ~32 files plus generated types is a large mechanical PR. Mitigation: search/replace with verification by `tsc` and CI.
- **Hidden references in raw SQL strings.** Anywhere we issue raw SQL with the old table names (RPCs, views, seed scripts) needs hand-checking. Mitigation: grep `shopify_product|shopify_variant` across the whole repo, not just TS.
- **Downstream consumers of `source`.** Once the column exists, reports / dashboards may want to filter by it. That's not a v1 requirement, but it's worth noting that the column being available will invite future ad-hoc use.

## Acceptance criteria (from the audit doc)

- ✅ A new tenant can create a BOM without connecting Shopify.
- ✅ Existing Shopify-connected BOMs work unchanged after migration (no data loss, no FK breakage).
- ✅ CSV wizard can create BOMs against imported variants without any Shopify dependency.
