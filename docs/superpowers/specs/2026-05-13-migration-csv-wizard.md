# Migration CSV Wizard — Product Spec

**Date:** 2026-05-13
**Status:** Spec, pre-build
**Owner:** Founder (solo)
**Strategic context:** Single highest-leverage GTM investment per `docs/research/manuva-gtm/results/`. Unlocks three defector pools simultaneously — Katana (16), Craftybase (17), Cin7/DEAR (18). Without this wizard, the "Katana alternative AU" / "Craftybase alternative AU" / "Cin7 alternative AU" inbound funnels fall over at the trial conversion step.

---

## 1. Problem & success criteria

**Problem.** Defectors from Craftybase, Katana, and Cin7 arrive with hundreds-to-thousands of components, dozens of BOMs, supplier catalogues, and live inventory balances already maintained in the incumbent tool. Without an in-app migration path, the only way to start a trial is to hand-key data or pay a consultant — which collapses trial-to-paid conversion. Manuva needs a self-serve, in-app CSV importer that ingests the standard export formats of all three incumbents and produces a working tenant (components, suppliers, BOMs, on-hand inventory) in under 30 minutes.

**Success criteria.**

| Metric                                            | Target            |
| ------------------------------------------------- | ----------------- |
| Time-to-first-BOM-imported (Craftybase, ≤30 BOMs) | ≤ 10 min          |
| Time-to-full-tenant (Craftybase Indie tier)       | ≤ 30 min          |
| Time-to-full-tenant (Cin7 Core, 1000 SKUs)        | ≤ 5 min wall-clock for import; ≤ 60 min including mapping |
| % migrations completed without founder intervention | ≥ 70% by month 6 |
| Source tools supported at v1                      | Craftybase, Katana, Cin7 Core |
| Trial-to-paid lift attributable to wizard         | +10pp on defector cohort vs hand-key baseline [unverified — needs measurement] |

---

## 2. Scope

### In scope (v1)

- CSV / XLSX upload (Cin7 Core exports `.xlsx`, Katana exports `.csv`, Craftybase exports `.csv`)
- Source-tool presets: **Craftybase**, **Katana**, **Cin7 Core (post-DEAR)**
- Entities: **components**, **component groups**, **suppliers**, **supplier-component links**, **BOMs** (including multi-level — see schema gap), **BOM lines**, **locations**, **inventory balances** (per location)
- Lot history import where the source export contains it (Cin7 batches, Craftybase manufacture lots)
- "Generic CSV" preset (manual mapping) for any other tool
- Resumable session (close browser, return later)
- Dry-run preview with row-level errors and warnings
- Audit log entry per import session

### Out of scope (v1)

- Customer order history (sales orders, fulfilments)
- Purchase order history (open POs, closed POs)
- Accounting ledger / journal entries (deferred to Xero/MYOB integration, post-launch)
- Live API sync (CSV one-shot only; API sync is a separate roadmap item)
- Reverse export (Manuva → another tool)
- Image / file attachments per component
- Custom field migration (anything outside the documented schema below)
- Manufacturing order history (in-flight production batches)

---

## 3. Source tool export formats

### 3.1 Craftybase

Per `docs/research/manuva-gtm/results/17_craftybase_graduates.json` (`competitive_context.switching_pain` = 2; "exports BOMs, materials, recipes cleanly to CSV").

| Export                | Format | Fields (key columns)                                                                                            |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| Materials             | CSV    | `Name`, `SKU`, `Manufacturer`, `Description`, `Category`, `Unit`, `Cost`, `Stock`, `Reorder Level`, `Notes`     |
| Recipes (BOMs)        | CSV    | `Product Name`, `Product SKU`, `Material Name`, `Material SKU`, `Quantity`, `Unit`                              |
| Manufactures (lots)   | CSV    | `Lot Number`, `Product`, `Manufactured Date`, `Quantity`, `Cost`, `Materials Used`                              |
| Manufacturers (suppliers) | CSV | `Name`, `Email`, `Phone`, `Website`, `Address`, `Notes`                                                         |
| Storage Locations     | CSV    | `Name`, `Description`                                                                                           |
| Product variants      | CSV    | `Product Name`, `Variant Name`, `SKU`, `Price`                                                                  |

Notes:
- Craftybase uses USD by default but supports tenant currency setting — currency is **not** in the row export, only the tenant setting [unverified for 2026 export format — confirm with a real export].
- Material `Unit` is free-text (Craftybase doesn't enforce a UoM table).
- Sub-recipes (a recipe that uses another recipe as an input) **do** exist in Craftybase under "Sub-Manufactures" — this is the multi-level BOM case.

### 3.2 Katana

Per `docs/research/manuva-gtm/results/16_katana_defectors.json` (`competitive_context.switching_pain` = 3; "BOM and product lists migrate cleanly").

Katana offers CSV exports via Settings → Data → Export (and per-table "Export to CSV" buttons in 2025-2026 UI).

| Export                  | Format | Fields (key columns)                                                                                                                          |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Materials               | CSV    | `Name`, `Code`, `Category`, `Default supplier`, `Purchase UOM`, `Purchase price`, `Currency`, `Reorder point`, `Default storage location`     |
| Products                | CSV    | `Name`, `Variant`, `SKU`, `Category`, `Sales price`, `Default selling UOM`                                                                    |
| Product recipes (BOMs)  | CSV    | `Product variant code`, `Ingredient variant code`, `Quantity`, `Notes`                                                                        |
| Manufacturing operations | CSV   | `Product variant code`, `Operation name`, `Resource`, `Time per unit`, `Cost per hour`                                                        |
| Suppliers               | CSV    | `Name`, `Email`, `Phone`, `Address line 1/2`, `City`, `Postcode`, `Country`, `Currency`, `Payment terms`                                       |
| Stocks (balances)       | CSV    | `Variant code`, `Location`, `In stock`, `Committed`, `Expected`, `Reorder point`                                                              |
| Storage locations       | CSV    | `Name`, `Address`                                                                                                                             |
| Batch tracking          | CSV    | `Variant code`, `Batch number`, `Expiry date`, `Quantity`, `Location` (only present if customer paid for the $249 traceability add-on)         |

Notes:
- Katana's "Product recipe" allows a product variant to be an ingredient of another product variant — this is the multi-level / sub-assembly case.
- Currency is per-row on `Materials.Purchase price`; per-tenant default exists too.
- "Manufacturing operations" maps loosely to `product_bom_labor` — partial mapping only in v1 (see §4).

### 3.3 Cin7 Core (post-DEAR rebrand)

Per `docs/research/manuva-gtm/results/18_cin7_dear_defectors.json` (`competitive_context.switching_pain` = 4; "heavy"). Cin7 Core's Import/Export module under Integration → Import & Export supports XLSX templates.

| Export                            | Format | Fields (key columns)                                                                                                                                 |
| --------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product list                      | XLSX   | `SKU`, `Name`, `Description`, `Category`, `Brand`, `Type` (stock/service/BOM), `Default Location`, `Stock Locator`, `UOM`, `Cost`, `Price Tier 1..N` |
| Suppliers                         | XLSX   | `Supplier Name`, `Currency`, `Payment Term`, `Tax Rule`, `Contact`, `Email`, `Phone`, `Account Number`, `Address`                                    |
| Supplier products (catalogue)     | XLSX   | `SKU`, `Supplier SKU`, `Supplier Name`, `Supplier Price`, `Currency`, `MOQ`, `Lead Time`                                                             |
| BOMs                              | XLSX   | `Product SKU`, `Component SKU`, `Component Type` (Component/Service), `Quantity`, `Wastage %`, `Operation`                                            |
| Stock on Hand (per location)      | XLSX   | `SKU`, `Location`, `Available`, `On Order`, `Allocated`, `Stock On Hand`, `Cost`, `Total Value`                                                       |
| Stock by Batch                    | XLSX   | `SKU`, `Batch/Serial`, `Expiry Date`, `Location`, `Quantity`, `Cost`                                                                                  |
| Locations                         | XLSX   | `Name`, `Type`, `Address`, `Default`                                                                                                                  |

Notes:
- Cin7 Core's `Type=BOM` product is the assembly; its child rows in the BOM sheet can themselves be `Type=BOM` — multi-level.
- `Wastage %` is the inverse of Manuva's `yield_pct` (see §4.3).
- Cin7 stores prices in tenant currency (set per organisation); XLSX includes the currency column when supplier-specific.

### 3.4 Generic CSV

Catch-all for MRPeasy / Inflow / Unleashed / Zoho Inventory / spreadsheet users. Manual column mapping for each of: components, suppliers, BOMs, locations, balances. No preset transformations.

---

## 4. Manuva target schema mapping

Source: `C:/dev/Assemblio/supabase/schema.sql`, `C:/dev/Assemblio/supabase/patches/suppliers_module.sql`, `C:/dev/Assemblio/supabase/patches/locations_manager_schema.sql`, `C:/dev/Assemblio/supabase/patches/bom_builder_redesign_schema.sql`.

### 4.1 Components

Target: `public.component` (schema.sql:146).

| Source field (CB / Katana / Cin7)                      | Manuva column                    | Transformation                                                                  | Required |
| ------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------- | -------- |
| `Name` / `Name` / `Name`                               | `component.name`                 | Trim; collapse internal whitespace                                              | Yes      |
| `SKU` / `Code` / `SKU`                                 | `component.sku`                  | Trim; uppercase normalised; null if empty                                       | No       |
| `Unit` / `Purchase UOM` / `UOM`                        | `component.unit`                 | Free-text passthrough; normalise common variants (`each`→`ea`, `Kilogram`→`kg`) | No       |
| `Cost` / `Purchase price` / `Cost`                     | `component.cost_per_unit`        | Decimal parse with locale fallback (see §6); strip currency symbols             | Yes (default 0) |
| `Reorder Level` / `Reorder point` / *(none)*           | `component.reorder_point`        | Decimal parse                                                                   | No       |
| *(derived)* `Reorder Level × 0.5`                      | `component.low_stock_level`      | Heuristic if no source field; else null                                          | No       |
| `Manufacturer` / `Default supplier` / *(via supplier sheet)* | `component.supplier_id`    | Resolve by `suppliers.name` after suppliers imported (two-pass)                  | No       |
| `Storage Location` / `Default storage location` / `Default Location` | `component.location_id` | Resolve by `location.name` after locations imported (two-pass)                  | No       |
| `Category` / `Category` / `Category`                   | `component_group.name` → `component.group_id` | Upsert into `component_group` per tenant; assign FK                  | No       |
| *(none — Cin7 `Stock Locator`)*                        | `component.bin_sub_location_id` / `bin_aisle_id` / `bin_bay_id` | Parse Cin7 stock locator string like `"Mezzanine / A12 / Bay 3"` by ` / ` delimiter; upsert into `bin_sub_location`, `bin_aisle`, `bin_bay` | No       |
| *(none)*                                               | `component.tenant_id`            | From `getServerTenantContext()`                                                 | Yes (server) |

**Schema gap flagged:**
- No `currency` column on `component` — costs that arrive in mixed currencies (Katana `Purchase price` + `Currency`) must be converted to tenant default currency at import time. **Recommendation:** require tenant to set default currency in Settings before importing; reject (or warn) on per-row currency mismatch. [unverified — needs founder confirmation on whether to add `component.currency` or hold the line.]
- No `description` column on `component`. Cin7 `Description` and Craftybase `Description` are dropped silently with a warning at preview.
- No `image_url` / attachments on `component`.

### 4.2 Suppliers

Target: `public.suppliers` (schema.sql:523) + extensions from `suppliers_module.sql`.

| Source field                                  | Manuva column                          | Transformation                                                       | Required |
| --------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------- | -------- |
| `Name` / `Name` / `Supplier Name`             | `suppliers.name`                       | Trim; case-preserving; dedup case-insensitive within tenant          | Yes      |
| `Email` / `Email` / `Email`                   | `suppliers.contact_email`              | Lowercase; basic regex validation                                    | No       |
| `Phone` / `Phone` / `Phone`                   | `suppliers.contact_phone`              | Passthrough                                                          | No       |
| `Website` / *(none)* / *(none)*               | `suppliers.website`                    | Prepend `https://` if missing scheme                                  | No       |
| `Address` / `Address line 1..Country` / `Address` | `suppliers.address`                | Concatenate address parts with `, `                                  | No       |
| `Notes` / *(none)* / *(none)*                 | `suppliers.notes`                      | Passthrough                                                          | No       |
| *(none)* / `Currency` / `Currency`            | `suppliers.default_currency`           | ISO 4217 normalisation (`AU$`→`AUD`)                                  | No       |
| *(none)* / `Payment terms` / `Payment Term`   | `suppliers.payment_terms`              | Passthrough                                                          | No       |
| *(none)* / *(none)* / `Lead Time`             | `suppliers.default_lead_time_days`     | Integer parse                                                        | No       |
| *(derived)*                                   | `suppliers.is_active`                  | Always `true` on import                                              | Yes      |

Supplier-component links go into `public.supplier_components` (suppliers_module.sql:55):

| Source                                                 | Manuva column                          |
| ------------------------------------------------------ | -------------------------------------- |
| Cin7 `Supplier products` / Katana materials `Default supplier` + `Purchase price` | `supplier_components.supplier_id` + `component_id` + `unit_cost` + `currency` + `lead_time_days` + `moq` |
| Cin7 `Supplier SKU`                                    | `supplier_components.supplier_part_number` |
| *(only one default supplier per component)*            | `supplier_components.is_preferred = true` |

### 4.3 BOMs and BOM lines

Target: `public.product_bom` (schema.sql:225) + `public.product_bom_component` (schema.sql:235) + `yield_pct` from `bom_builder_redesign_schema.sql`.

| Source field                                                                   | Manuva column                                | Transformation                                                                                              | Required |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| `Product Name`+`Variant` / `Product variant code` / `Product SKU`              | `product_bom.variant_id`                     | Two-pass: first create `shopify_product` + `shopify_variant` placeholder rows (see schema gap below), then FK | Yes      |
| *(implicit)*                                                                   | `product_bom.version`                        | Always `1` on import                                                                                        | Yes      |
| *(implicit)*                                                                   | `product_bom.status` / `is_active`           | `'active'` / `true`                                                                                         | Yes      |
| `Material SKU` / `Ingredient variant code` / `Component SKU`                   | `product_bom_component.component_id`         | Resolve by `component.sku` after components imported (two-pass)                                              | Yes      |
| `Quantity`                                                                     | `product_bom_component.quantity`             | Decimal parse                                                                                               | Yes      |
| Cin7 `Wastage %`                                                               | `product_bom_component.yield_pct`            | `1 - (wastage / 100)`; clamp to `(0, 1.0]`                                                                  | No       |
| Katana / Craftybase yield                                                      | `product_bom_component.yield_pct`            | Direct percentage `/ 100`                                                                                   | No       |
| Cin7 `Operation` / Katana `Operation name`                                     | `product_bom_labor.operation_name`           | v1: capture only `operation_name` and `sequence`; leave times/costs zero (founder fills in post-import)      | No       |

**Critical schema gaps:**

1. **No multi-level BOM support.** `product_bom_component.component_id` only references `component` (atomic raw materials), never another `product_bom`. All three source tools support sub-assemblies. **Resolution options for v1:**
   - (a) **Flatten on import** — recursively expand sub-assemblies into raw-material quantities at import time (loses the structural information; cost rolls up correctly).
   - (b) **Create a placeholder `component` row for each intermediate (sub-assembly)** and link as a regular component — this matches the existing schema but breaks "make → consume → make" production logic.
   - (c) **Add a new column `product_bom_component.child_product_bom_id`** (nullable FK to `product_bom`) + a `CHECK (component_id IS NOT NULL OR child_product_bom_id IS NOT NULL)`. Most correct; requires schema migration.
   - **Recommended:** (a) for v1 with a clear preview warning ("Your sub-assemblies have been flattened — see the Multi-Level BOMs roadmap item for native support"); ship (c) as a follow-up patch.

2. **BOMs are coupled to `shopify_variant`.** `product_bom.variant_id` is `not null references shopify_variant(id)` (schema.sql:228). A defector with no Shopify store cannot have any BOMs without first creating shopify_variant placeholder rows. **Resolution for v1:** insert placeholder rows into `shopify_product` and `shopify_variant` with synthetic `shopify_id` values prefixed `migration:<sourceTool>:<sku>`. Tagged as such so a later "Connect Shopify" flow can merge them. **Better long-term:** decouple `product_bom` from Shopify by introducing a `product` table that `shopify_variant` points at. [unverified — needs founder confirmation on whether to take the longer route in v1.]

3. **No multi-currency support on components.** See §4.1 gap.

4. **No `description` on BOM or component.** Lossy import — flag in preview.

### 4.4 Locations

Target: `public.location` (schema.sql:161), `public.bin_sub_location`, `public.bin_aisle`, `public.bin_bay`.

| Source                                                       | Manuva column                            | Transformation                                                              | Required |
| ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- | -------- |
| Craftybase `Storage Locations.Name` / Katana `Storage locations.Name` / Cin7 `Locations.Name` | `location.name`                          | Trim; dedup by name within tenant                                            | Yes      |
| Cin7 `Default` flag                                          | `location.is_default`                    | Boolean parse; only one `is_default = true` allowed per tenant (enforce in app) | No       |
| Cin7 `Stock Locator` parsed components                       | `bin_sub_location.name` / `bin_aisle.name` / `bin_bay.name` | Split by ` / ` or `-`; upsert hierarchically                              | No       |

### 4.5 Inventory balances

Target: `public.inventory_balance` (schema.sql:261) + an audit `public.inventory_movement` row per imported balance.

| Source                                                                                | Manuva column                                              | Transformation                                          | Required |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | -------- |
| Craftybase `Materials.Stock` / Katana `Stocks.In stock` / Cin7 `Stock On Hand`        | `inventory_balance.on_hand`                                | Decimal parse                                            | Yes (0 default) |
| Katana `Stocks.Committed` / Cin7 `Allocated`                                          | `inventory_balance.reserved`                               | Decimal parse                                            | No       |
| *(none)*                                                                              | `inventory_balance.in_prod`                                | Always `0` on import                                     | Yes      |
| *(component + location keys from above)*                                              | `inventory_balance.component_id` + `location_id`           | Resolve via two-pass                                     | Yes      |

For each balance row, also insert one `inventory_movement` with `reason = 'migration_import'`, `reference_type = 'migration_session'`, `reference_id = <migration_session.id>` so movements ledger ties back to the import.

### 4.6 Lot history

**Schema gap — no lot/batch tables exist today.** Manuva research JSON (17_craftybase_graduates: `lot_batch_criticality = 4`; 16_katana_defectors: "lot tracking already shipping pre-launch") repeatedly references included lot tracking, but `grep -i 'lot\|batch'` against `supabase/schema.sql` and all patches returns nothing relevant. [unverified — needs founder confirmation on whether lot-tracking schema is in a yet-unreviewed branch.]

**v1 behaviour:** if the source export contains lot data (Katana `Batch tracking`, Cin7 `Stock by Batch`, Craftybase `Manufactures`), the wizard:
- Detects the file
- Shows a banner: "Lot history detected. Manuva lot tracking is rolling out in <next-release>. Your lot rows have been saved to `migration_session.deferred_payload` and will be replayed automatically when lot tracking ships."
- Stores the parsed rows verbatim in JSONB on the migration session for later replay.

---

## 5. UI flow

Route: `/app/settings/migration` (admin / super_admin only — gated per `CLAUDE.md`).

### Step 1 — Pick source

| Element                | Behaviour                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Source picker          | Tiles for Craftybase, Katana, Cin7 Core, Generic CSV. Each tile has a "How to export" linked-doc.  |
| Tenant default currency confirm | Inline "Your tenant is set to AUD — costs in any other currency will be flagged in preview." Link to Settings → Company. |
| CTA                    | "Continue" — disabled until a source is picked.                                                    |

### Step 2 — Upload files

| Element                | Behaviour                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Drop zones             | One per expected file for the chosen preset (Components, Suppliers, BOMs, Locations, Balances, Lot history). Each drop zone shows the source-tool's filename hint ("Usually called `materials.csv` in Katana"). |
| File type validation   | CSV or XLSX; max 50 MB per file; reject zero-byte files.                                            |
| Encoding detection     | Sniff UTF-8 BOM, UTF-16, Windows-1252; convert to UTF-8 server-side.                                |
| Header preview         | Show first 5 rows of each file inline once uploaded.                                                |
| CTA                    | "Continue" — enabled when at least Components is uploaded. Suppliers/BOMs/Balances/Locations optional. |

### Step 3 — Auto-map columns

| Element                | Behaviour                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Per-file mapping table | One row per source column; dropdown to pick Manuva field. Preset tools come pre-mapped using the §3 tables; user can override. |
| Unmapped warning       | Source columns left as "Skip" are listed in a collapsed "Will be dropped" panel.                    |
| Required-field check   | Block "Continue" until every Manuva `Required = Yes` field has a mapped source column.              |
| Transform preview      | For each mapped column, show the first 3 source values → target values after transformation (cost parsing, currency, etc.). |
| CTA                    | "Run preview" — kicks off dry-run.                                                                  |

### Step 4 — Review preview

| Element                | Behaviour                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Summary header         | "Will create: 412 components, 38 suppliers, 27 BOMs, 4 locations. 3 errors, 14 warnings."           |
| Tabbed row-level table | Tabs: Components / Suppliers / BOMs / Locations / Balances / Errors / Warnings.                     |
| Error row              | Red badge; click to expand reason; "Skip row" or "Fix in CSV and re-upload" options.                |
| Warning row            | Amber badge; will import as-is unless skipped.                                                      |
| Duplicate handling     | Per entity: choice of `Skip existing` (default) / `Update existing` / `Create new with suffix`.     |
| CTA                    | "Confirm import" — disabled if any required errors remain.                                          |

### Step 5 — Confirm & import

| Element                | Behaviour                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Progress bar           | Live progress per entity ("Components 312/412…"). Streams from the background job (see §7).         |
| Cancel                 | "Cancel import" — stops job; existing inserts remain (no rollback); shown as "Partially imported". |
| Completion screen      | Counts + "View components" / "View BOMs" deep-links. Email receipt to user.                         |
| Audit log              | One `activity_log` row with `event = 'migration_import_completed'` and full counts in metadata.     |

### Special cases

| Case                     | UI behaviour                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Duplicate components (same `sku`) | Preview shows merge; user chooses Skip / Update / Suffix per row or globally.                |
| Unmapped suppliers (component references supplier not in suppliers CSV) | Preview prompts "Create 7 missing suppliers with name-only?" — default yes. |
| Missing currency         | Per-row warning if currency ≠ tenant default; preview shows converted cost using user-entered FX rate (default 1.0). |
| Sub-assembly in BOM      | Preview row shows "This BOM contains a sub-assembly — it will be flattened to raw materials. See FAQ." |
| Component referenced in BOM but not in components file | Hard error; user must re-upload components file or skip BOM line. |

---

## 6. Edge cases & validation

| Case                                                                  | Validation / handling                                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-level BOM cycles (A → B → A)                                    | Detect via DFS during preview; mark all rows in the cycle as errors; reject the cycle.                                                                       |
| Component referenced in BOM but not in component file                 | Hard error in preview tab "BOMs"; offer "Create stub component with cost=0".                                                                                  |
| Inventory balance < 0                                                 | Warning; default action: clamp to 0 on import. User can opt to import as-is (Manuva allows negative on-hand via movement deltas, but UI flags it).             |
| Lot tracking enabled in Manuva but no lot data in source              | Warning banner: "Components imported without lot data — first goods-inwards receipt will establish initial lots."                                            |
| Lot data in source but no lot tracking in Manuva                      | Banner per §4.6; stash in `migration_session.deferred_payload`.                                                                                              |
| UTF-8 BOM (0xEF 0xBB 0xBF) prefix on first header                     | Strip silently.                                                                                                                                              |
| CRLF vs LF line endings                                               | Normalise to LF server-side before parsing.                                                                                                                  |
| Locale numbers: `"1.234,56"` (de-DE) vs `"1,234.56"` (en-US)          | Detect by majority pattern across the column; fall back to en-US; show transform preview so user can flip.                                                  |
| Currency symbols in cost (`$12.50`, `€12,50`, `AU$ 12.50`)            | Strip symbol; parse numeric; capture symbol as a per-column currency hint.                                                                                  |
| Mixed currencies in one column                                        | Per-row warning; require explicit tenant currency + FX table (user-entered) before "Confirm import".                                                        |
| Excel "scientific notation" SKUs (`1.23E+11`)                         | Detect; warn user that SKU column should be reformatted as text in source export.                                                                            |
| Empty rows / trailing whitespace rows                                 | Skip silently.                                                                                                                                               |
| Duplicate SKU within same upload                                      | Error; offer to keep first / keep last / suffix.                                                                                                             |
| Component name >255 chars                                             | Truncate with warning.                                                                                                                                       |
| Required field empty                                                  | Hard error.                                                                                                                                                  |
| Numeric overflow (`cost_per_unit > 1e9`)                              | Hard error.                                                                                                                                                  |
| Foreign key resolution failure (supplier name typo)                   | Warning; offer fuzzy-match suggestion (Levenshtein ≤ 3) with one-click accept.                                                                                |

---

## 7. Implementation notes

### Server actions vs API routes

Per `CLAUDE.md`: use server actions in `actions.ts` files. Recommended layout:

```
src/app/app/settings/migration/
  page.tsx                       # wizard host (client component)
  actions.ts                     # createMigrationSession, advanceStep, etc.
  parse-csv.ts                   # pure functions: header sniff, locale detect
  preset/
    craftybase.ts                # column maps + transforms
    katana.ts
    cin7.ts
    generic.ts
  preview/
    preview-table.tsx
  steps/
    pick-source.tsx
    upload.tsx
    map-columns.tsx
    review.tsx
    confirm.tsx
```

Server actions handle all DB writes via `getServerTenantContext()`. CSV/XLSX **parsing** runs server-side (use `papaparse` for CSV, `xlsx` package for XLSX; both already work in Node-runtime server actions). File upload uses Supabase Storage bucket `migration-uploads/<tenant_id>/<session_id>/` with RLS limited to the owning tenant.

### Background processing for large imports

Per the existing stack (Supabase + Next.js 15 on Vercel; no BullMQ, no separate worker process):

**Recommendation:** **Supabase Edge Function** named `migration-import-runner`, invoked at the end of Step 5 with `{ session_id }`. The function reads parsed staging data from a new table `migration_session_row` (one row per staged source row, JSONB), executes in chunks of 500, writes via service-role inserts honouring RLS through explicit `tenant_id` set per row.

Rationale:
- **vs BullMQ:** the repo has no Redis. Adding Redis is heavy for a single import flow.
- **vs `pg_cron`:** pg_cron is for scheduled work, not one-shot triggered jobs.
- **vs server action streaming:** 1000-row Cin7 imports fit in a single 60-second Vercel function invocation, but 5000+ rows risk timeout. Edge Function with 150-second max + statement-level chunking is safer.
- **vs Vercel cron + queue table:** overkill; the user expects sub-5-minute feedback.

Progress polling: client polls `/app/settings/migration/<session_id>/status` (a server action) every 2 seconds; status driven by a new `migration_session.progress` JSONB column updated by the edge function. [unverified — Vercel Functions on the project's plan may support the timeout natively without needing an Edge Function. If so, prefer a single server-action invocation that uses `runtime = 'nodejs'` and `maxDuration = 300`.]

### Audit log

Per `CLAUDE.md`: insert to `activity_log` (schema.sql:550). Events:

| Event                              | Metadata fields                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `migration_session_started`        | `source_tool`, `session_id`                                                           |
| `migration_files_uploaded`         | `session_id`, `file_count`, `total_bytes`                                             |
| `migration_preview_generated`      | `session_id`, `error_count`, `warning_count`, `entity_counts`                         |
| `migration_import_started`         | `session_id`                                                                          |
| `migration_import_completed`       | `session_id`, `duration_ms`, `inserted_counts`, `skipped_counts`, `deferred_lot_count`|
| `migration_import_failed`          | `session_id`, `error_message`, `entity`, `row_number`                                 |

### Tenant context

Every server action and edge-function entry validates via `getServerTenantContext()` from `@/lib/tenant/context`. The edge function takes the session as input and re-reads `migration_session.tenant_id` rather than trusting any client-supplied value.

### New tables required

```sql
-- supabase/patches/migration_csv_wizard_schema.sql

create table public.migration_session (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  created_by uuid references auth.users(id),
  source_tool text not null check (source_tool in ('craftybase','katana','cin7_core','generic')),
  status text not null default 'draft'
    check (status in ('draft','uploading','mapping','previewing','importing','completed','partial','failed','cancelled')),
  step int not null default 1,
  column_map jsonb not null default '{}'::jsonb,
  preview_summary jsonb,
  progress jsonb not null default '{}'::jsonb,
  deferred_payload jsonb not null default '{}'::jsonb,  -- e.g. lot rows
  fx_rates jsonb not null default '{}'::jsonb,
  duplicate_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.migration_session_file (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  session_id uuid not null references public.migration_session(id) on delete cascade,
  entity text not null check (entity in ('components','suppliers','boms','locations','balances','lots','operations','variants')),
  storage_path text not null,
  byte_size bigint not null,
  detected_encoding text,
  detected_locale text,
  headers jsonb not null,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.migration_session_row (
  id bigserial primary key,
  tenant_id uuid not null references public.tenant(id),
  session_id uuid not null references public.migration_session(id) on delete cascade,
  entity text not null,
  source_row_number int not null,
  raw jsonb not null,
  resolved jsonb,
  status text not null default 'pending'
    check (status in ('pending','ok','warning','error','skipped','imported')),
  message text,
  created_at timestamptz not null default now()
);

create index migration_session_row_session_entity_idx
  on public.migration_session_row (session_id, entity);

-- RLS: tenant_isolation_* on all three (mirror suppliers_module.sql).
```

---

## 8. Out-of-scope / future

| Item                                      | Notes                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| MYOB / Xero / QBO journal import          | Gated on accounting roadmap; only relevant once Manuva has accounting integration.          |
| Live API sync (Cin7 / Katana / Craftybase) | All three have APIs; deferred to V2 — CSV one-shot covers the migration story.              |
| Reverse export (Manuva → another tool)    | Anti-pattern for retention; only support if a customer explicitly asks at offboarding.      |
| MRPeasy / Unleashed / Inflow presets      | Use Generic CSV in v1; add presets once we have ≥3 customers from each.                     |
| Custom field migration                    | Schema doesn't support custom fields on `component` today.                                  |
| Image / attachment import                 | Schema gap on `component.image_url`; deferred.                                              |
| Multi-level BOM native support            | Schema-gap resolution per §4.3 — separate spec.                                              |
| Lot tracking native support               | Schema-gap resolution per §4.6 — separate spec. Wizard pre-stages the data.                  |
| Order history / PO history                | Out for v1; meaningful only with accounting integration anyway.                              |
| Webhook-driven incremental import         | Out for v1.                                                                                  |

---

## 9. Acceptance criteria

| ID  | Criterion                                                                                                                                       | How tested                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AC1 | A Craftybase Indie-tier customer (≤1000 order lines, typical ≤200 SKUs, ≤30 BOMs) can complete a full migration in <30 minutes with zero founder intervention. | Internal dry-run with a real anonymised Craftybase export; measure wall-clock + tickets opened. |
| AC2 | A Katana customer with multi-level BOMs sees correct nesting after import — either flattened (v1) with the warning shown, OR nested (post §4.3 fix). | Synthetic test fixture with a 3-level Katana BOM; verify all leaf-component quantities + cost roll-up match the Katana product cost ± 0.01. |
| AC3 | A Cin7 customer with 1000+ SKUs completes import within 5 minutes wall-clock from "Confirm import" → "Completed".                              | Performance test fixture with 1500 SKU XLSX; measure background-job duration p95 < 300 s. |
| AC4 | All inserts are tenant-scoped; cross-tenant data leakage is impossible.                                                                         | RLS unit test asserting that a service-role insert with mismatched `tenant_id` is rejected by the RLS check policy. |
| AC5 | Cancelling mid-import leaves the tenant in a consistent state (no orphaned `product_bom_component` rows without their `product_bom`).         | Cancellation integration test; verify FK integrity post-cancel.                          |
| AC6 | Re-running the same import is idempotent under the `Skip existing` policy.                                                                      | Run twice; assert second run inserts 0 rows.                                             |
| AC7 | A failed row does not block other rows in the same entity.                                                                                      | Inject a row-level FK error; assert other rows imported, failed row appears in `migration_session_row` with `status='error'`. |
| AC8 | The audit log contains one start + one completion event per session, plus per-entity counts in metadata.                                        | Query `activity_log` post-import.                                                        |
| AC9 | Lot data from Katana/Cin7/Craftybase is preserved in `migration_session.deferred_payload` for replay when lot tracking ships.                  | Import a Katana export with the batch sheet; assert `deferred_payload.lots` length matches source row count. |
| AC10 | Wizard is gated to `admin` / `super_admin` role per `CLAUDE.md`.                                                                                | Auth integration test; member role gets 403.                                              |

---

## Schema gaps identified (summary)

| # | Gap                                                                              | Severity | Resolution                                                                                                  |
| - | -------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| 1 | `product_bom.variant_id` is a non-null FK to `shopify_variant`                  | High     | Insert placeholder shopify_product / shopify_variant rows tagged `migration:<tool>:<sku>` in v1; longer-term decouple `product_bom` from Shopify. |
| 2 | No multi-level BOM (no `product_bom_component.child_product_bom_id`)            | High     | v1 flattens with warning. Follow-up patch adds `child_product_bom_id` + check constraint.                   |
| 3 | No lot/batch tables in schema (despite GTM research treating it as shipping)    | High     | Stash in `migration_session.deferred_payload` until lot-tracking schema lands. **Founder confirmation needed on lot-tracking timeline.** |
| 4 | No `currency` on `component`; mixed-currency catalogues require pre-import FX    | Medium   | Tenant-default currency + per-row warnings + user-entered FX table at preview.                              |
| 5 | No `description` / `image_url` / attachment fields on `component`               | Medium   | Drop with warning. Add columns in a separate "richer-components" spec.                                       |
| 6 | `inventory_balance` is per `(component, location)` — no per-bin balances        | Low      | Bin location stored on `component`, not balance — acceptable for v1.                                         |
| 7 | `bin_aisle` is unique per warehouse (not per sub-location) per `bin_aisle_unique_per_sublocation.sql` patch | Low | Use existing unique constraint; map Cin7 Stock Locator carefully (warn on aisle-name collisions across sub-locations). |
| 8 | `cost_per_unit` is numeric without precision — locale parse must be deterministic | Low      | Server-side locale detection + explicit FX rounding to 4 decimals.                                          |
| 9 | No "manufacturing operations" home for imported labor lines beyond `product_bom_labor` (which is keyed to a department) | Medium | v1 imports `operation_name` only with `department_id = <first-active-department>` and zero times; founder fills in. |
