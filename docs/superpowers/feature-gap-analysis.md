# Assemblio — Feature Gap Analysis

**Date:** 2026-05-04
**Status:** Decision artefact — pre-launch, principled (not customer-validated)
**Source spec:** `docs/superpowers/specs/2026-05-04-feature-gap-analysis-design.md`

---

## 1. Context & assumptions

### Personas

- **Solo maker** (1–10 staff) — Shopify-native, single location, assembling kits or finished goods. Lives in spreadsheets today. Onboarding speed matters more than depth.
- **Mid manufacturer** (10–50 staff) — Shopify retail plus some wholesale, multiple staff entering data, real production planning. Depth and roles/permissions start to matter.
- **Job shop** — variable BOMs, every order slightly different, quoting is as important as inventory. Per-order BOM overrides and lead-time visibility dominate.

All three must work for the product to be viable; no persona-specific weighting in the analysis.

### Competitive frame

- **Katana MRP** — visual production planning, similar Shopify-native pitch. Beat them on UX or price.
- **Cin7 Core (DEAR) / Unleashed** — broader inventory/ERP, accounting-first. Beat them on simplicity.
- **Spreadsheets + Shopify alone** — the real default for solo makers. Beat them on automation and onboarding speed.

### Market

Australia / New Zealand first. Xero + MYOB are dominant; QuickBooks is a distant third. AUD-only is acceptable for v1. GST handling is required for any accounting integration. Local logistics (AusPost / StarTrack / Sendle) and BAS reporting are local hooks US-built tools won't ship fast.

### How to read the scorecards

Each gap is classified into **exactly one** of four lenses, picked for the highest-leverage marketing angle (Differentiators > AU/NZ hooks > Table stakes > JTBD):

| Lens | Question it answers |
|---|---|
| Table stakes | Will the prospect even shortlist us without this? |
| JTBD friction | Does the current user keep hitting a wall? |
| AU/NZ market hooks | Can we win this region before US tools catch up? |
| Differentiators | Where do Katana/Cin7 hurt their users, and could we be obviously better? |

**Scoring:**
- **CV (1–5)** — customer value: 1 = nice-to-have, 5 = blocker.
- **MI (1–5)** — marketing impact: 1 = invisible, 5 = headline-worthy.
- **Effort:** S = days, M = 1–2 weeks, L = ~1 month, XL = >1 month (calibrated to this codebase).
- **Score** = `CV × MI ÷ effort_weight` (S=1, M=2, L=4, XL=8). Higher is better. Tie-break: unblocks-other-priority > reduces-churn-risk.

---

## 2. Per-feature scorecards

### 2.1 Shopify Product Import

**Today:** OAuth-based connect, paginated GraphQL pulls of products/variants/orders, idempotent upserts, and 7 registered webhooks for real-time refresh. Solid foundation, but it discards line prices and assumes one Shopify store per tenant.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Multi-location mapping** — map Shopify Locations to Assemblio Locations during connect. Without it, any merchant with >1 warehouse cannot sync stock back to Shopify correctly.
- **Price/cost capture** — `unit_sell_price` is dropped on every order line. Margin reporting is therefore wrong by construction.
- **Tags / collections / metafields** — most merchants categorise products via Shopify metadata. Ignoring it forces re-entry.
- **Manual re-sync of one product** — operator should be able to force-refresh a single SKU without a full store sync.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — no preview before first sync. Anything imported is committed; mistakes need DB cleanup.
- **Mid** — multi-store brands (e.g. AU + NZ Shopify stores) cannot consolidate inventory in one Assemblio tenant.
- **Job-shop** — Shopify "custom product options" (line-item properties) aren't captured, so per-order specs are invisible to production.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **Multi-store consolidation for AU + NZ split brands** — common pattern locally where one operator runs `brand.com.au` and `brand.co.nz` as separate Shopify stores. Single Assemblio tenant should consolidate.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **Auto-suggest BOM template per imported variant** — match variant title/SKU patterns to existing templates, prompt to apply on import. Katana imports variants but leaves BOM seeding entirely manual.
- **"Variants without BOMs" surface** — a permanent dashboard counter that can never be zero by accident. The most common "I forgot" failure mode in MRP.
- **Push-back enrichment** — write component cost / lead-time back to Shopify metafields so theme can show "ships in 5 days." Neither Katana nor Cin7 close that loop.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Multi-location mapping | Table stakes | Mid | 5 | 3 | M | 7.5 |
| Price/cost capture | Table stakes | All | 5 | 4 | S | 20.0 |
| Tags / metafields | Table stakes | All | 3 | 2 | S | 6.0 |
| Manual single-SKU resync | Table stakes | All | 2 | 1 | S | 2.0 |
| Sync preview before commit | JTBD | Solo | 3 | 2 | S | 6.0 |
| Multi-store consolidation | JTBD + AU hook | Mid | 4 | 4 | M | 8.0 |
| Capture line-item properties | JTBD | Job-shop | 4 | 3 | S | 12.0 |
| Auto-suggest BOM template | Differentiator | All | 4 | 5 | M | 10.0 |
| Variants-without-BOMs surface | Differentiator | All | 4 | 4 | S | 16.0 |
| Push-back enrichment to Shopify | Differentiator | Mid | 2 | 4 | M | 4.0 |

### 2.2 Component Inventory & Item Details

**Today:** Inventory hub with KPI cards, manual movement form, and a balance table; component catalogue with detail tabs (overview, last 50 movements, BOM usage). Reservation tracking lives in `inventory_movement.delta_reserved` after a recent refactor — the ledger is now clean.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Replenishment recommendations** — `reorder_point` is captured but there's no "what to order this week" view. This is the headline reason MRPs exist.
- **Multi-location stock view** — schema supports per-location balances but UI surfaces them as a flat list, not a matrix or per-location drill-down.
- **Barcode field + scanner support** — no `barcode` column on `component`. Required for any warehouse staff workflow.
- **Component images** — currently text only. Photos materially reduce mis-pick rates.
- **Bin / zone within a location** — granularity below "location" is missing.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — "what should I reorder this week?" requires manually scanning the components table. The information is there but not surfaced.
- **Mid** — `inventory_movement` has no `actor_id`; you can see a movement happened but not who entered it. Audit fails.
- **Job-shop** — one-off components consumed for a single bespoke order have no clean tracking flow.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **AUD cost auto-pull from Xero supplier invoices** — closes the inventory ↔ accounting loop without manual cost-per-unit updates. Foundational for the AU finance story.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **Mobile barcode count + receive flow** — Katana's mobile is widely complained about. A clean PWA-grade mobile experience for warehouse staff is a crisp positioning angle.
- **Inventory cost layers (FIFO / weighted average)** — Cin7 has it, Katana does not. Adding it positions Assemblio as "Katana with grown-up costing."
- **"Ghost stock" alerts** — proactive surface when on_hand projected to go negative inside the next N days based on open orders. Neither competitor does this prediction natively.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Replenishment recommendations | Table stakes | All | 5 | 5 | M | 12.5 |
| Multi-location matrix UI | Table stakes | Mid | 4 | 3 | S | 12.0 |
| Barcode + scanner | Table stakes | Mid | 4 | 4 | M | 8.0 |
| Component images | Table stakes | All | 3 | 3 | S | 9.0 |
| Bin / zone | Table stakes | Mid | 3 | 2 | M | 3.0 |
| Reorder action button | JTBD | Solo | 4 | 3 | S | 12.0 |
| Movement actor audit | JTBD | Mid | 4 | 2 | S | 8.0 |
| AUD cost pull from Xero | AU hook | Mid | 4 | 5 | L | 5.0 |
| Mobile barcode PWA | Differentiator | Mid | 4 | 5 | L | 5.0 |
| Cost layers (FIFO/avg) | Differentiator | Mid | 4 | 4 | L | 4.0 |
| Ghost-stock projection | Differentiator | All | 4 | 5 | M | 10.0 |

### 2.3 Bills of Material (with versioning)

_(populated by Task 3)_

### 2.4 Goods Inwards

_(populated by Task 4)_

### 2.5 Orders from Shopify

_(populated by Task 5)_

### 2.6 Stocktake

_(populated by Task 6)_

### 2.7 Suppliers

_(populated by Task 7)_

### 2.8 Reports

_(populated by Task 8)_

---

## 3. Cross-feature top-10

_(populated by Task 9)_

---

## 4. Strategic clusters

_(populated by Task 10)_

---

## 5. Out of scope

_(populated by Task 11)_
