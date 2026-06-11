# BOM Copy-Source Picker Design

**Date:** 2026-06-12
**Status:** Approved

## Problem

The "copy from variant" flow in the BOM lightbox lists every BOM in the tenant
(capped at 250, fetched on every variant page load) in one flat `<select>`.
Tenants with ~100 products × 10 variants make this unusable and the upfront
fetch wasteful.

Users almost always copy a BOM from a sibling variant of the same product, so
that should be the primary call to action. Copying from a different product
must remain possible via search + browse.

## Decisions

- **"Product family" = sibling variants** of the same product (existing
  product → variant relationship; no new grouping concept).
- **One entry per source variant.** Picking a variant copies its **active** BOM
  version; if none is active, the **latest non-archived** version. No
  version-level entries.
- **Cross-family picker = search + product browse**, loaded on demand via
  server actions (no big upfront fetch).
- **Placement: inline in the lightbox** start-from bar — sibling quick-picks
  shown directly, "Browse all products…" expands a panel in place.
- Applies only to **new-BOM creation** (`!bomId`); the add-component flow on an
  existing draft never showed the start-from bar.

## Data flow

### Variant page (server)

Replace the tenant-wide 250-row `product_bom` query with a sibling query:
non-archived BOMs belonging to variants with the same `product_id` as the
current variant, excluding the current variant. Resolve one BOM per sibling
(active-else-latest) and pass `siblings: { bomId, label }[]` to the lightbox
(label = variant title + SKU).

### New server actions (`src/app/app/products/actions.ts`)

All tenant-scoped via `getServerTenantContext()`, using the admin client for
`super_admin` (same pattern as `fetchBomLines`):

| Action | Returns |
|---|---|
| `fetchCopySourceProducts()` | Products with ≥1 variant having a non-archived BOM, with variant counts. Called when the browse panel opens. |
| `fetchCopySourceVariants(productId)` | That product's variants with BOMs, one entry per variant (active-else-latest). Called when a product row is expanded. |
| `searchCopySources(query)` | Variants matching product title / variant title / SKU, grouped by product, limit ~20. Called debounced from the search input. |

### Pure logic

`src/lib/bom/copy-sources.ts`: `pickBomPerVariant(rows)` — given
`{ id, variant_id, version, status, is_active }[]`, returns one BOM per
variant: prefer `is_active`, else highest `version` with
`status !== "archived"`. Unit-tested with vitest.

## UI (start-from bar, new-BOM mode)

- **Sibling chips:** "Copy from:" + quick-pick buttons for sibling variants.
  Show the first 6; "+N more" expands the rest. Clicking a chip runs the
  existing flow: `fetchBomLines(bomId)` → pre-populate `ComponentPicker` →
  save label becomes "Copy BOM".
- **"Browse all products…"** link button toggles an inline panel below the
  bar:
  - Search input on top, 300 ms debounce → `searchCopySources`.
  - Below it, the product list from `fetchCopySourceProducts()`; clicking a
    product expands its variants via `fetchCopySourceVariants(productId)`.
  - Clicking any variant behaves exactly like a sibling chip and collapses
    the panel.
- After choosing a source, the bar shows "Copying from {product / variant}".
- No siblings with BOMs → omit the chips row; show only "Browse all
  products…".
- The template select is unchanged.

## Cleanup

- Drop the `sourceBoms` prop from `BomLightbox`, `BomEditor`, and
  `BomSeedPanel` (replaced by `siblings`; unused in the editor path).
- Remove the 250-row tenant-wide BOM fetch and `copyOptions` mapping from the
  variant page.

## Error handling

- Server-action failures render an inline error inside the browse panel.
- Empty search results → "No matching variants with a BOM".
- Loading states on chips/panel while `fetchBomLines` or browse data is in
  flight (existing `copyLoading` pattern).

## Testing

- Vitest unit tests for `pickBomPerVariant` (active wins, latest non-archived
  fallback, archived-only variants excluded).
- `npm run build` type-checks the wiring.
- Manual verify: variant with siblings → chips appear and copy works; browse
  panel search and product expansion; variant with no siblings → browse only.
