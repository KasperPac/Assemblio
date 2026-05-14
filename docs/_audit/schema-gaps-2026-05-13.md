# Manuva — Schema gaps blocking GTM Phase 1

> **Source:** surfaced during migration CSV wizard spec drafting (`docs/superpowers/specs/2026-05-13-migration-csv-wizard.md`).
> **Date:** 2026-05-13
> **Owner:** Kasper (self-resolving).
> **Why this matters:** these six items block parts of the 90-day GTM plan (`docs/marketing/90-day-gtm-plan.md`) — most acutely the Katana / Craftybase / Cin7 defector funnel and the cosmetics / candles / food / supplements verticals.

---

## Status overview

| # | Gap | Status | Blocks |
|---|---|---|---|
| 1 | Lot / batch tracking | In pipeline | Supplements, food, pet treats, fresh pet, kombucha — all Phase-1 compliance verticals; "recall-readiness in 7 days" content wedge |
| 2 | `product_bom.variant_id` hard-coupled to `shopify_variant` | Being resolved | Every non-Shopify migration (Katana / Cin7 / Craftybase / WooCommerce / Amazon) |
| 3 | No multi-level BOM (no `child_product_bom_id`) | Will resolve | Cosmetics with sub-assemblies, food co-packers, anything with formulation → packaging tiers; competitive parity with Katana |
| 4 | No `currency` on `component` | Being resolved | Multi-currency supplier costing, AU brands sourcing from overseas, UK/US secondary markets |
| 5 | No `description` / `image_url` on `component` | Will add | Visual onboarding for cosmetics + candles + ceramics (case-study-friendly segments); migration parity with Craftybase |
| 6 | `inventory_balance` per (component, location), not per-bin | Confirmed; will fix | Brand claim "bin/aisle locations shipped" in marketing brief; warehouse-hire trigger segment (spreadsheet-stage shops) |

---

## 1. Lot / batch tracking — pipeline

**Current state.** No `lot` / `batch` / `lot_movement` tables observed in `supabase/schema.sql` or recent patches. The marketing brief and GTM research both assume lot tracking is shipped at launch.

**Required for:**
- Supplements (TGA listed-medicine compliance + COA tracking)
- Packaged foods + co-packers (FSANZ + FSMA 204 traceability)
- Pet treats + fresh pet (AS5812 recall readiness)
- Kombucha / fermented beverages (excise lot reporting, recall)
- Cosmetics (AICIS-aligned batch records, retailer COA requests)

**Minimum data model (sketch — verify against actual implementation):**
- `lot` (id, tenant_id, component_id, lot_code, manufactured_at, expires_at, supplier_id?, po_id?, quantity_in, quantity_remaining, status)
- `lot_movement` (id, tenant_id, lot_id, movement_type, quantity, ref_table, ref_id, occurred_at)
- `bom_line.consumes_specific_lot` flag (optional — for downstream genealogy)
- RLS: same tenant pattern as `inventory_movement`

**Acceptance criteria:**
- A goods-inwards receipt can create one or more lots per receipt line.
- An allocation / fulfilment can consume from specific lots (FIFO by default; manual override).
- A "recall report" can list every order + customer for a given lot in < 5 seconds for ≤ 10,000 movements.
- Lot data exports cleanly to CSV with FSANZ-aligned columns (lot code, qty, manufacture date, expiry, downstream order references).

**GTM-side effect when shipped:**
- Unblocks the "Recall-readiness in 7 days, not 7 weeks" content asset → compounds across 4 of 6 regulated verticals.
- Promotes supplements + co-packers from "deferred to waitlist" (in the 90-day plan) to "Phase 2 candidates pending credibility staircase."

---

## 2. `product_bom.variant_id` hard-coupled to `shopify_variant` — being resolved

**Current state.** `product_bom.variant_id` references `shopify_variant.id`. Customers migrating from Katana / Cin7 / Craftybase / Woo / Amazon-native have no Shopify variant.

**Required for:**
- 100% of the migration CSV wizard motion (the highest-leverage product investment in the plan)
- WooCommerce + Amazon roadmap items
- Any future "Shopify-optional" tier

**Minimum change (sketch):**
- Introduce a tenant-owned `product_variant` table (or generalise `shopify_variant` to support non-Shopify sources via a `source` enum: `shopify` / `manuva` / `woo` / `amazon` / `imported_csv`).
- `product_bom.variant_id` → references the new generalised table.
- Shopify webhook handler continues to upsert into the same table with `source = 'shopify'`.

**Acceptance criteria:**
- A new tenant can create a BOM without connecting Shopify.
- Existing Shopify-connected BOMs work unchanged after migration (no data loss, no FK breakage).
- CSV wizard can create BOMs against imported variants without any Shopify dependency.

**Migration plan note:** this is a structural schema change. Plan a one-shot migration with double-write window if any tenant is in production.

---

## 3. Multi-level BOM (no `child_product_bom_id`) — will resolve

**Current state.** `bom_line` references components only. Cosmetics (formulation → fill → packaged unit), food co-packers (recipe → batch → SKU), and any sub-assembly workflow can't model the tiering.

**Required for:**
- Cosmetics, candles, food, supplements — the entire Phase-1 vertical mix
- Competitive parity vs Katana (which has multi-level BOM)
- Brief claims "multi-level/nested" BOMs are shipped (`docs/marketing/manuva-brief.md` §2)

**Minimum change (sketch):**
- Add `bom_line.child_product_bom_id` (nullable FK to `product_bom.id`).
- Constraint: a line has exactly one of `component_id` or `child_product_bom_id`.
- Cycle-detection on save (a BOM can't reference itself directly or transitively).
- Allocation engine: when consuming a `child_product_bom_id` line, recurse and consume the child BOM's components in the same atomic transaction.

**Acceptance criteria:**
- A skincare brand can model: raw ingredients → bulk batch BOM → finished SKU BOM, and consume correctly in one allocation pass.
- Stocktake / inventory valuation roll up correctly across levels.
- Cycle detection rejects A→B→A on save with a clear error.

**Migration plan note:** verify whether the marketing brief's "multi-level/nested" claim was aspirational. If yes, **the brief needs updating now** to avoid in-pipeline customer disappointment.

---

## 4. No `currency` on `component` — being resolved

**Current state.** `component.unit_cost` (or equivalent) stored as a single decimal with no currency context.

**Required for:**
- AU brands sourcing ingredients/packaging from China, EU, US (most cosmetics, candles, food)
- UK + US secondary-market expansion
- Accurate margin reporting once the financial/profitability dashboard ships

**Minimum change (sketch):**
- `component.currency_code` (varchar(3), ISO 4217, default `'AUD'`).
- `component.unit_cost` remains the cost in `currency_code`.
- Add `component.cost_in_aud` computed/cached column (or compute on read) using a tenant-level FX-rate table or a daily Open Exchange Rates pull.
- Suppliers may have a `default_currency_code` to seed the component on PO receipt.

**Acceptance criteria:**
- Importing a Craftybase CSV with `unit_cost_usd` lands as `component.currency_code = 'USD'`, `unit_cost = <value>`, computed AUD on read.
- Inventory valuation reports show both raw-currency and AUD columns.
- An AUD-only tenant sees no UI change.

---

## 5. No `description` / `image_url` on `component` — will add

**Current state.** `component` table has name + SKU but no rich metadata.

**Required for:**
- Visual onboarding for cosmetics, candles, ceramics, pet treats (segments where Manuva landing-page + product UI doubles as case-study artwork)
- Migration parity with Craftybase (which stores material descriptions + images)

**Minimum change (sketch):**
- `component.description` (text, nullable).
- `component.image_url` (text, nullable) — Supabase Storage public bucket.
- `component.image_thumb_url` (computed via Supabase image transform, or post-write Edge function).
- UI: image upload in the component edit form; thumbnail in component list/cards.

**Acceptance criteria:**
- A cosmetics founder uploads ingredient images during onboarding and sees them in the BOM editor.
- CSV wizard maps Craftybase `material_description` → `component.description`.
- Empty values render cleanly (no broken-image icons).

---

## 6. `inventory_balance` per (component, location), not per-bin — will fix

**Current state.** `inventory_balance` is keyed on `(component_id, location_id)`. The marketing brief (`docs/marketing/manuva-brief.md` §2) claims "bin/aisle locations" are shipped — but balance and movement granularity don't reach the bin level.

**Required for:**
- Spreadsheet-stage segment (the buying trigger is "just hired first warehouse person" — bin layout is *the* reason they buy)
- Brand claim integrity (marketing brief implies bin-level tracking exists)
- Larger Pro-tier customers (multi-bin shops)

**Minimum change (sketch):**
- `bin` table (id, tenant_id, location_id, code, aisle, shelf, position) — verify if exists; brief implies yes.
- `inventory_balance` PK → `(component_id, location_id, bin_id NULL OK for "unbinned")`.
- `inventory_movement` adds optional `bin_id` source/dest columns.
- Stocktake sessions can be scoped per-bin.
- Goods inwards can target a bin (default to a tenant-configurable "receiving" bin).

**Acceptance criteria:**
- A warehouse hire can scan into a specific bin (UI lookup) and the balance updates per-bin.
- Stocktake variance is per-bin, not just per-location.
- Reports show "stock in bin A3-04" not just "stock at warehouse Sydney."
- Tenants without bins continue to see the simpler location-only flow (bin_id NULL).

---

## Suggested resolution order

1. **#2 (variant_id generalisation)** — gates the CSV wizard, which gates the entire defector funnel. Highest GTM ROI per dev-day.
2. **#1 (lot tracking)** — gates 4 of 6 Phase-1 verticals and the "recall-readiness" content wedge. Largest single GTM unlock.
3. **#3 (multi-level BOM)** — closes the gap between the marketing brief's claim and reality. Avoids on-call customer surprise.
4. **#6 (bin granularity)** — same reasoning as #3; brief claim doesn't match implementation.
5. **#4 (currency)** — quality-of-life for cosmetics/candles; not gating any segment but blocks accurate margin in the financial dashboard.
6. **#5 (component description/image)** — pure polish; do alongside any UI work in the component form.

---

## Cross-references

- 90-day GTM plan: `docs/marketing/90-day-gtm-plan.md`
- Charter Design Partner program: `docs/marketing/charter-design-partner-program.md`
- CSV wizard spec (full mapping detail): `docs/superpowers/specs/2026-05-13-migration-csv-wizard.md`
- GTM research report: `docs/research/manuva-gtm/report.md`
- Marketing brief (verify "multi-level BOM" and "bin/aisle locations" claims): `docs/marketing/manuva-brief.md`
