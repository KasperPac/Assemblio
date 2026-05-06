# BOM Builder Redesign — Design Spec

**Date:** 2026-05-07
**Status:** Approved

---

## Overview

A redesign of the BOM authoring experience across three surfaces: the product detail page, the variant detail page (BOM editor), and the version management tab. The core problem is that getting started with a BOM requires too many clicks and decisions before the user can add a single component. Secondary problems are a lack of visibility into margin at the BOM level and no way to compare BOM versions without manually inspecting them.

---

## Scope

**In scope:**
- Product detail page — variant table replacing the dropdown picker
- Variant detail page — tab structure, empty state, BOM editor table, cost rollup footer
- Component picker — split layout with category sidebar, search, and live BOM preview
- Versions tab — side-by-side comparison view

**Out of scope:**
- Labour & Routing tab redesign (separate spec)
- Sub-BOM / nested assembly support
- BOM effective-from dates
- CSV import (deferred)
- Template management UI changes

---

## 1. Product Detail Page

### Problem
The current page shows one variant at a time via a dropdown. There is no way to see BOM coverage across all variants at once, and variants without BOMs are not surfaced until you click into each one.

### Design

**Header:**
- Product title, Shopify ID, variant count, last sync time
- BOM coverage bar: `X / Y variants` with a green progress bar and an amber badge showing how many variants are missing BOMs

**Variants table** (replaces the sidebar dropdown + main panel):

| Column | Notes |
|---|---|
| Variant | Name + "vN active/draft · updated X ago" subline |
| SKU | From Shopify |
| BOM status | `Active BOM` (green) / `Draft BOM` (amber) / `No BOM` (grey) badge |
| Components | Count of lines in active or draft BOM |
| Mat. cost | Material cost from active BOM (green if costed, — if missing) |
| Margin | Gross margin vs Shopify sell price (red + "⚠ low" if < 20%) |
| Actions | `Edit BOM` for variants with a BOM · `+ Create BOM` (blue, primary) for variants with no BOM |

**Variants without BOMs** are highlighted with a left amber border and a subtly tinted row background. The `+ Create BOM` action is the primary button in the row — no drilling in required.

**Footer:** Average margin across all active BOMs, and the worst-margin variant called out by name.

**Row click:** Navigates to the variant detail page (`/app/products/variants/[variantId]`).

---

## 2. Variant Detail Page — Tab Structure

The variant page adopts a tabbed layout with four tabs:

1. **Overview** — variant metadata (Shopify title, SKU, price, sync status)
2. **Bill of Materials** — component lines, BOM toolbar, cost rollup footer
3. **Labour & Routing** — existing labour operations (unchanged in this spec)
4. **Versions** — version list + comparison view

---

## 3. Getting Started — Empty State

### Problem
When a variant has no BOM, the current UI presents a 4-card grid (Create from Scratch / Build from Template / Copy & Modify / Import CSV). This forces a path decision before the user understands the difference, and the CSV card is non-functional.

### Design

Replace the 4-card grid with a focused empty state on the Bill of Materials tab:

```
[large + icon]
No bill of materials yet
Add components to define what goes into making this variant.

        [ + Add Components ]   ← primary CTA, opens picker directly

  or  start from a template  ·  copy another variant's BOM
```

- **"+ Add Components"** opens the component picker immediately — no intermediate options screen
- **"start from a template"** and **"copy another variant's BOM"** are subtle text links below the CTA
- The 4-card grid and the separate BOM lightbox options screen are removed

---

## 4. Component Picker

### Design

A modal with a split layout: browse panel on top, BOM preview table below.

**Top: Browse panel**

- **Search bar** spanning the full width at the top — filters by name or SKU
- **Category sidebar** (left, ~150px): lists all component groups with counts. Clicking a category filters the list. "All" is selected by default
- **Component list** (right): scrollable table with columns: checkbox, name, SKU, unit, unit cost, qty
  - Ticking a row selects it and reveals a +/− qty stepper inline in the same row
  - Unticking removes the component from the selection
  - Selected rows are highlighted (blue-tinted background)
  - The qty stepper lives in the browse list — not in the bottom table

**Bottom: BOM preview table**

- Mirrors the current selection in real time
- Columns: component name, SKU, unit, qty (reflects stepper above), line cost, ✕
- Qty in the table is read-only — it reflects whatever is set in the stepper above
- ✕ removes the row and unticks it in the browse panel
- **Footer:** running material cost total + `Save BOM (N items)` primary button + `Cancel` secondary

**Behaviour:**
- The picker opens with no pre-selection
- Category filter and search work together (category narrows the list; search filters within it)
- The modal is tall enough to show both panels without scrolling the modal itself

---

## 5. BOM Editor

The Bill of Materials tab when a BOM exists.

### Toolbar

```
[DRAFT v2 badge]  Based on v1 · created 2 days ago          [+ Add component]  [⋯]  [Set Active]
```

- Status badge: `DRAFT` (amber) or `ACTIVE` (green)
- `+ Add component` opens the component picker in selection-only mode (adds to existing BOM)
- `⋯` menu: Duplicate to new draft, Archive
- `Set Active` promotes the draft to active (disabled when already active)

### Component lines table

| Column | Notes |
|---|---|
| Component | Name |
| SKU | From component record |
| Unit | From component record |
| Qty | +/− stepper, inline editable |
| Yield % | Stored as decimal (0.0–1.0), displayed as percentage in UI. Defaults to 100%. Edit inline. Values < 100% highlighted amber. Line cost adjusts: `unit_cost × qty ÷ yield_pct`. A "scrap cost" subline shows the extra amount |
| Unit cost | From component record. If missing, shows `—` |
| Line cost | `unit_cost × qty ÷ yield`. If unit cost missing, shows `—` |
| (remove) | ✕ icon to remove the line |

**"No cost" badge:** Components with no `cost_per_unit` show a red `no cost` badge next to their name so missing data is immediately visible.

### Cost rollup footer

Pinned to the bottom of the BOM editor. Updates live as quantities and yield values change.

```
Materials        Labour          Total BOM cost    Sell price       Gross margin
$11.81           —               $11.81            $49.00           75.9%
incl. scrap      Add routing →                     from Shopify     ⚠ estimate — missing costs
```

- **Materials** — sum of all line costs including scrap losses
- **Labour** — from Labour & Routing tab; shows `—` with a link to add routing if none exists
- **Total BOM cost** — materials + labour
- **Sell price** — pulled from the Shopify variant `price` field
- **Gross margin** — `(sell_price - total_bom_cost) / sell_price × 100`
- If any component is missing a cost, margin shows `⚠ estimate — missing costs`

---

## 6. Versions Tab

### Version list (left panel, ~200px)

Each version shows:
- Version number (v1, v2, v3…)
- Status badge: `ACTIVE` (green) / `DRAFT` (amber) / `ARCHIVED` (grey, reduced opacity)
- Date created and author
- Total material cost

`+ New draft` button at the top creates a new draft copying the current active BOM.

**Active version** has a blue left border and blue-tinted background. Clicking any version selects it and shows that version's full component list on the right. Clicking a second version (while one is already selected) enters comparison mode — the right panel switches to the side-by-side layout. Clicking either selected version again deselects it and returns to single-version view.

### Comparison view (right panel)

Two-column side-by-side layout — no code-style diff symbols.

**Header row:**
- Left: `Current (Active)` label · version number · `ACTIVE` badge · stats · no action
- Right: `New version` label · version number · `DRAFT` badge · stats · `Make this the active version` button

**Per-component rows:**

| Scenario | Left column | Right column |
|---|---|---|
| Unchanged | Greyed out | Greyed out |
| Qty changed | Normal display | New qty in amber, "was X" subline |
| Added in new version | "Not included" (italic, dark) | Component name + "New in vN" label (green) |
| Removed in new version | Component name + "Removed in vN" label (red) | "Not included" (italic, dark) |

**Footer:**
- Left: total material cost for the active version + margin at current sell price
- Right: total material cost for the draft + delta vs active (e.g. `+$1.65`) + "Margin drops to X% if activated" warning

---

## Data Model Changes

No schema changes required for this redesign. All data is already available:
- `product_bom.is_active`, `version`, `status` — version list and badges
- `product_bom_component.quantity` — inline editing (existing update action)
- `shopify_variant.price` — sell price for margin calculation (currently not fetched in the variant query — needs to be added to the select)
- Component `cost_per_unit` — line cost and rollup

**New server actions needed:**
- `updateBomComponentQuantity` — already exists
- Yield % requires a new `yield_pct` column on `product_bom_component` (default 1.0, i.e. 100%)

### Schema addition

```sql
alter table public.product_bom_component
  add column if not exists yield_pct numeric not null default 1.0
    check (yield_pct > 0 and yield_pct <= 1.0);
```

Line cost formula: `cost_per_unit × quantity ÷ yield_pct`

---

## Error Handling

- **Picker — no components in catalogue:** Show "No components found. Add components in the Components section first." with a link.
- **Picker — category empty after filter:** Show "No components in this category match your search."
- **Set Active on a BOM with missing costs:** Allow it but show a warning banner: "This BOM has X components without costs. Margin figures will be incomplete."
- **Delete only component line:** No special handling — an empty BOM is valid (it stays as a draft).
- **Comparison with no diff:** Show "These versions are identical." in the right panel.

---

## Affected Files

| File | Change |
|---|---|
| `src/app/app/products/[productId]/page.tsx` | Rewrite — variant table layout |
| `src/app/app/products/variants/[variantId]/page.tsx` | Tab structure, BOM editor, cost rollup |
| `src/app/app/products/bom-seed-panel.tsx` | Replace with simple empty state component |
| `src/app/app/products/bom-lightbox.tsx` | Remove options screen, go straight to picker; update picker with category sidebar + split layout |
| `src/app/app/products/actions.ts` | `updateBomComponentQuantity` already exists; add yield_pct support |
| `src/app/app/bom/actions.ts` | No changes |
| `supabase/patches/` | New patch: add `yield_pct` to `product_bom_component` |
