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

**Today:** Per-variant BOM with auto-incrementing version, status lifecycle (draft → active → archived), unique-active-per-variant enforced by partial index, and labor lines with hours plus utilities. Active BOM is snapshotted into `job_cost_snapshot` at order plan time. Templates exist but are component-only.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Sub-BOM nesting** — current BOMs are flat. Any assembled product made of sub-assemblies (very common in mid-size manufacturing) cannot be modelled.
- **Yield / scrap rate per component** — every BOM in the real world over-consumes. Without this field, planned cost is consistently optimistic.
- **Effective-from dates on versions** — needed when a new revision should activate on a future date (cost change, supplier swap).
- **BOM cost rollup view** — total cost (materials + labor + overhead) at a glance per BOM. Currently lives in costing flow, not BOM detail.
- **Drawings / images on BOM** — assembly instructions live in PDFs today; should attach to BOM directly.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — draft / active flip is non-obvious. Editing a draft doesn't activate it; user must explicitly set active. Confusion drives "why isn't my order using my changes?" tickets.
- **Mid** — no diff view between versions. Operator can't answer "what changed in v3?" without manual comparison.
- **Job-shop** — every order's BOM may diverge from the variant's stock BOM. Per-order overrides aren't supported; user has to clone the BOM for each job.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **Modern Award labor cost benchmarks** — pre-loaded AU labor rates by department/role for accurate quoting. Useful for AU job shops; meaningless to US-built tools.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **BOM diff / changelog UI** — visual comparison of v2 vs v1 with added / removed / changed lines highlighted. Katana's is bare-bones; Cin7 SMB tier has none.
- **Per-order BOM overrides for job shops** — order line carries an override snapshot with deltas from variant active BOM. Unique angle for the job-shop persona.
- **Where-used heat map** — given a component, show all BOMs and projected demand in next 30 days. Better than Cin7's static where-used list.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Sub-BOM nesting | Table stakes | Mid | 5 | 4 | L | 5.0 |
| Yield / scrap rate | Table stakes | All | 4 | 3 | S | 12.0 |
| Effective-from dates | Table stakes | Mid | 3 | 2 | S | 6.0 |
| BOM cost rollup | Table stakes | All | 4 | 3 | S | 12.0 |
| Drawings on BOM | Table stakes | Mid | 3 | 3 | S | 9.0 |
| Active-flip UX rework | JTBD | Solo | 4 | 3 | S | 12.0 |
| BOM diff UI | JTBD + Diff | Mid | 4 | 5 | M | 10.0 |
| Per-order BOM override | JTBD + Diff | Job-shop | 5 | 5 | M | 12.5 |
| AU labor rate library | AU hook | Job-shop | 3 | 4 | S | 12.0 |
| Where-used heat map | Differentiator | All | 3 | 4 | M | 6.0 |

### 2.4 Goods Inwards

**Today:** Atomic receive RPC with full and per-line variants, partial-receipt support, automatic PO completion when all lines received. Inventory writes go through the standard movement ledger with `purchase_order_receipt` reason.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Batch / lot tracking** — non-negotiable for food, cosmetics, supplements, electronics-with-firmware. Entire verticals are unsellable to without it.
- **Expiry date capture** — same verticals need it for FEFO.
- **Multi-location receive** — currently hard-wired to the tenant default location. Mid/job-shop with two warehouses can't use this feature at all.
- **GRN (printable receiving note)** — operators expect to print and sign one.
- **Discrepancy / short-shipment workflow** — receive less than expected → flag for follow-up rather than quietly leaving the line open.
- **3-way match (PO ↔ receipt ↔ supplier invoice)** — accounting baseline.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — typing the receive form on a phone in the warehouse is awkward; touch targets weren't designed for it.
- **Mid** — receiving team needs a screen they can read across the warehouse; current UI is dense.
- **Job-shop** — non-PO receipts (R&D samples, free supplier samples, returns from customers) have no flow.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **AusPost / Sendle / StarTrack tracking ingestion** — paste tracking number on PO, auto-update PO status to in_transit / arrived. Cuts the "did our delivery arrive?" Slack threads.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **Photo-based receive** — take a photo of the delivery slip, OCR matches lines to the PO, operator confirms. Removes ~80% of typing.
- **Auto-create variance order** — short-receive automatically opens a "chase the supplier" task with email draft.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Batch / lot tracking | Table stakes | All | 5 | 5 | M | 12.5 |
| Expiry date capture | Table stakes | All | 4 | 4 | S | 16.0 |
| Multi-location receive | Table stakes | Mid | 5 | 3 | M | 7.5 |
| GRN print | Table stakes | All | 3 | 2 | S | 6.0 |
| Discrepancy workflow | Table stakes | All | 4 | 3 | M | 6.0 |
| 3-way match | Table stakes | Mid | 4 | 3 | L | 3.0 |
| Mobile receive UI | JTBD | Solo | 4 | 4 | M | 8.0 |
| Receive screen for warehouse | JTBD | Mid | 3 | 3 | S | 9.0 |
| Non-PO receipts | JTBD | Job-shop | 3 | 2 | S | 6.0 |
| AusPost / Sendle tracking | AU hook | All | 3 | 4 | M | 6.0 |
| Photo-OCR receive | Differentiator | All | 4 | 5 | L | 5.0 |
| Auto-chase short receipt | Differentiator | Mid | 3 | 3 | S | 9.0 |

### 2.5 Orders from Shopify

**Today:** Bidirectional sync (webhook + manual), BOM-driven component allocation with idempotency tokens, atomic reservation movements, and automatic financial-plan + labor-plan generation per line. Mature flow — but the order entity itself is stripped of customer info, prices, and any concept of "order this came in by phone."

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Customer info persisted** — name, email, address dropped on sync. Cannot run customer reports, send updates, or honour repeat-customer pricing.
- **Manual order entry** — phone, email, B2B orders are entered nowhere. The product silently assumes 100% Shopify revenue.
- **Wholesale order workflow** — per-customer pricing, payment terms, hold-on-credit are absent.
- **Refunds / partial refunds** — cancellation acts as a refund proxy; partial refund of one line in an otherwise-shipped order has no model.
- **Order priority / due date** — production scheduling can't honour what doesn't exist in the data model.
- **Manual freight / discount line items** — can't be added.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — `unit_sell_price = 0` means margin-per-order is wrong. The single most-asked metric is broken at the data layer.
- **Mid** — wholesale customers want NET-30 invoicing flow; today they have to live in Shopify Plus or out-of-band.
- **Job-shop** — every job starts as a quote, then becomes an order on acceptance. There's no quote artefact.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **GST breakdown on order** — required for BAS reporting and any AU-compliant tax invoice.
- **AusPost / StarTrack / Sendle label printing** — print and pay for shipping inside Assemblio rather than bouncing back to Shopify Shipping.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **Live capacity check at allocate time** — does pushing this order through put `department_utilization_week` over capacity? Show traffic light at order detail. Capacity table already exists.
- **Make-to-order vs make-to-stock segmentation** — per-variant flag drives different replenishment behaviour. Neither competitor handles this cleanly.
- **Auto-quote engine for job shops** — paste customer requirements, get a draft BOM + price + ETA. Big differentiator for the job-shop persona.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Customer info persisted | Table stakes | All | 4 | 3 | S | 12.0 |
| Manual order entry | Table stakes | All | 5 | 4 | M | 10.0 |
| Wholesale workflow | Table stakes | Mid | 5 | 4 | L | 5.0 |
| Partial refund model | Table stakes | All | 3 | 2 | M | 3.0 |
| Order priority / due date | Table stakes | Mid | 4 | 3 | S | 12.0 |
| Manual freight/discount lines | Table stakes | All | 3 | 2 | S | 6.0 |
| Capture line sell price | JTBD | All | 5 | 4 | S | 20.0 |
| Quote → order flow | JTBD | Job-shop | 5 | 5 | L | 6.25 |
| GST breakdown | AU hook | All | 4 | 4 | M | 8.0 |
| AusPost label printing | AU hook | All | 3 | 4 | L | 3.0 |
| Live capacity check on allocate | Differentiator | Mid | 4 | 5 | M | 10.0 |
| Make-to-order/stock flag | Differentiator | Mid | 3 | 4 | M | 6.0 |
| Auto-quote engine | Differentiator | Job-shop | 4 | 5 | XL | 2.5 |

### 2.6 Stocktake

**Today:** Session-based with full lifecycle states and an atomic apply RPC that handles row-locking and rollback correctly. Solid foundations, weak ergonomics — the form-driven UI assumes a small inventory and a single counter.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Bulk CSV import of counts** — typing each line is the deal-breaker.
- **Mobile / barcode-driven counting** — prerequisite for any warehouse over ~200 SKUs.
- **`in_prod` variance handling** — currently always passed as 0; WIP counted differently is silently dropped.
- **Dedup constraint on `(session, component)`** — same component can be entered twice with conflicting counts; second one overwrites.
- **Pagination** — UI caps at 12 sessions and 20 lines on the page.
- **Per-line variance approval** — current model is all-or-nothing; reviewer can't accept some lines and reject others.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — for a 50-SKU brand the session form is OK once a quarter, but typing on a phone in the warehouse is rough.
- **Mid** — multiple counters working different aisles simultaneously have no concurrency story.
- **Job-shop** — WIP counts (jobs partially built on the floor) aren't first-class.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **EOFY stocktake report** — June 30 valuation snapshot pre-formatted for Xero / accountant. Annual ritual every AU/NZ business does.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **Blind-count mode** — hide the expected number from the counter to enforce real counting. Katana shows expected by default; serious users want this.
- **ABC-driven cycle count cadence** — auto-schedule weekly counts of A items, monthly B, quarterly C. Katana has cycle counts but no auto-cadence.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Bulk CSV import | Table stakes | All | 4 | 3 | S | 12.0 |
| Mobile / barcode counting | Table stakes | Mid | 5 | 5 | L | 6.25 |
| `in_prod` variance handling | Table stakes | Mid | 3 | 1 | S | 3.0 |
| Dedup constraint | Table stakes | All | 4 | 1 | S | 4.0 |
| Pagination | Table stakes | Mid | 3 | 1 | S | 3.0 |
| Per-line variance approval | Table stakes | Mid | 3 | 2 | M | 3.0 |
| Concurrent counters | JTBD | Mid | 3 | 2 | M | 3.0 |
| WIP counts | JTBD | Job-shop | 3 | 2 | M | 3.0 |
| EOFY report → Xero | AU hook | All | 4 | 5 | M | 10.0 |
| Blind-count mode | Differentiator | Mid | 3 | 4 | S | 12.0 |
| ABC cycle-count cadence | Differentiator | Mid | 3 | 4 | M | 6.0 |

### 2.7 Suppliers

**Today:** A name and a foreign key. That's it. Supplier directory exists as a list with rename capability. Linked from `purchase_order` and `component`. Suppliers is barely a feature.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Contact info** — email, phone, address, primary contact name. The minimum a supplier record must hold.
- **Lead time per supplier (and per supplier-component)** — required for any replenishment recommendation to be honest.
- **Multi-supplier per component** — primary + alternates with priority. Single-supplier-per-component is unworkable for any business with > 50 SKUs.
- **Supplier-specific pricing** — `component.cost_per_unit` is one number; reality is per-supplier (and often quantity-tiered).
- **Currency per supplier** — overseas suppliers price in USD/CNY/EUR; current model has no concept.
- **MOQ, pack size, payment terms** — drive PO suggestions and accounting.
- **Document attachments** — quotes, invoices, certifications need a place.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — "the email I always use to order from supplier X" lives in Gmail because Assemblio has nowhere to store it.
- **Mid** — no way to evaluate supplier performance (on-time, defect rate). Procurement decisions stay gut-feel.
- **Job-shop** — alternate suppliers for the same component is critical for resilience; unsupported.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **ABN field + GST registration flag** — standard procurement compliance in AU. Without ABN field, supplier records can't generate compliant PO documents.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **Auto-generated PO emails** — branded PDF + attached line items + reply-to-track. Cin7 has it as a paid add-on; Katana's is basic.
- **Supplier scorecards** — on-time delivery, quality issues, cost variance, lead-time variance per supplier per quarter. Procurement managers crave this; competitors barely touch it.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Contact info | Table stakes | All | 5 | 3 | S | 15.0 |
| Lead times | Table stakes | All | 5 | 4 | S | 20.0 |
| Multi-supplier per component | Table stakes | Mid | 5 | 4 | M | 10.0 |
| Supplier-specific pricing | Table stakes | Mid | 4 | 3 | M | 6.0 |
| Currency per supplier | Table stakes | Mid | 3 | 3 | L | 2.25 |
| MOQ / pack size / terms | Table stakes | All | 3 | 2 | S | 6.0 |
| Document attachments | Table stakes | All | 3 | 2 | S | 6.0 |
| Supplier email capture | JTBD | Solo | 4 | 2 | S | 8.0 |
| Performance evaluation | JTBD | Mid | 3 | 4 | M | 6.0 |
| ABN + GST flag | AU hook | All | 4 | 3 | S | 12.0 |
| Auto-generated PO emails | Differentiator | All | 4 | 5 | M | 10.0 |
| Supplier scorecards | Differentiator | Mid | 3 | 5 | M | 7.5 |

### 2.8 Reports

**Today:** Four KPI views (planned margin, actual margin, capacity, integrity audit) plus CSV export. No filters, no charts on the Reports page itself, no PDF, no scheduling. The data is there — it's the reporting surface that's thin.

**Table stakes — gaps that block a credible Katana/Cin7 alternative:**
- **Date-range filters** — every report hard-codes "last 20." Unusable for monthly or quarterly review.
- **Saved / scheduled reports** — leadership wants a Monday-morning P&L email automatically.
- **PDF export** — accountants and customers want PDFs, not CSV.
- **Charts on Reports page** — chart components exist only on dashboard. Same data, two paint jobs.
- **Inventory aging report** — what stock has been sitting idle > 90 days?
- **Sales by SKU / product / customer** — basic merch reports, missing.
- **Open PO commitment report** — total $ on open POs (cash-flow planning).
- **Demand forecast** — even a naive 90-day moving average beats nothing.

**JTBD friction — workflow breakdowns for our personas:**
- **Solo** — current Reports page is auditor-flavoured; needs a "where am I making money this month" view in plain English.
- **Mid** — leadership wants weekly auto-emailed P&L; manual export-to-Excel ritual every Monday.
- **Job-shop** — per-job profitability roll-up by customer is the single most-requested view.

**AU/NZ market hooks — cheap leverage US-built tools won't ship fast:**
- **GST report / BAS-ready format** — pre-formatted quarterly BAS export to Xero. Local accountants will demand it.
- **EOFY stock valuation report** — already mentioned in Stocktake; Reports page is where it shows up.

**Differentiators — gaps in Katana/Cin7 we could exploit:**
- **Margin variance attribution** — "we missed margin by 4% this month: 2.5% material cost rise, 1% labor over-run, 0.5% overhead." Neither competitor explains the why.
- **Capacity heat map** — `department_utilization_week` already exists in DB. Surfacing it as a coloured calendar grid is cheap and visually striking.
- **"What if" margin simulator** — slider for material cost / labor rate / sell price, see margin live. Wins demos.

**Scoring summary:**

| Item | Lens | Persona | CV | MI | Effort | Score |
|---|---|---|---|---|---|---|
| Date-range filters | Table stakes | All | 5 | 3 | S | 15.0 |
| Saved / scheduled reports | Table stakes | Mid | 4 | 4 | M | 8.0 |
| PDF export | Table stakes | All | 3 | 3 | S | 9.0 |
| Charts on Reports page | Table stakes | All | 3 | 4 | S | 12.0 |
| Inventory aging | Table stakes | All | 4 | 3 | S | 12.0 |
| Sales by SKU / product / customer | Table stakes | All | 4 | 3 | S | 12.0 |
| Open PO commitment | Table stakes | Mid | 3 | 2 | S | 6.0 |
| Demand forecast | Table stakes | All | 4 | 4 | M | 8.0 |
| Plain-English margin view | JTBD | Solo | 4 | 4 | S | 16.0 |
| Per-job profitability by customer | JTBD | Job-shop | 4 | 4 | S | 16.0 |
| GST / BAS report → Xero | AU hook | All | 5 | 5 | L | 6.25 |
| Margin variance attribution | Differentiator | Mid | 4 | 5 | M | 10.0 |
| Capacity heat map | Differentiator | Mid | 3 | 5 | S | 15.0 |
| What-if margin simulator | Differentiator | All | 3 | 5 | M | 7.5 |

---

## 3. Cross-feature top-10

These are the highest-scoring items across all 8 scorecards. Notice the pattern: nearly every entry is **S-effort** — small build, big customer/marketing leverage. That's not a coincidence; it reflects how thin some of the existing surfaces (Suppliers, Reports) really are.

Ties at Score = 20.0 are broken by **breadth of impact** (affects all personas > Mid only). Ties at Score = 16.0 / 15.0 are broken by **unblocks-other-priority** (e.g., supplier contact info unblocks PO email automation; date-range filters unblock saved reports).

| Rank | Item | Source | Persona | CV | MI | Effort | Score | Why it's in the top-10 |
|---|---|---|---|---|---|---|---|---|
| 1 | Capture line sell price on order sync | §2.5 Orders | All | 5 | 4 | S | 20.0 | Margin metrics are silently wrong without it. Highest-leverage one-day fix. |
| 2 | Lead times per supplier | §2.7 Suppliers | All | 5 | 4 | S | 20.0 | Unblocks honest replenishment. Without it, every "what to order" answer is fiction. |
| 3 | Price/cost capture from Shopify | §2.1 Shopify | All | 5 | 4 | S | 20.0 | Tied with #1 — both broken at sync layer. Fix together. |
| 4 | Plain-English margin view | §2.8 Reports | Solo | 4 | 4 | S | 16.0 | Solo persona's #1 question, currently buried in auditor-flavoured KPIs. |
| 5 | Per-job profitability by customer | §2.8 Reports | Job-shop | 4 | 4 | S | 16.0 | Highest-leverage Reports addition for the job-shop persona. |
| 6 | Expiry date capture on receive | §2.4 Goods Inwards | All | 4 | 4 | S | 16.0 | Unlocks food/cosmetics/supplements verticals (sizeable AU market). |
| 7 | Date-range filters across Reports | §2.8 Reports | All | 5 | 3 | S | 15.0 | Every report hard-codes "last 20." Unblocks saved/scheduled reports later. |
| 8 | Supplier contact info | §2.7 Suppliers | All | 5 | 3 | S | 15.0 | Foundational; unblocks supplier emails, scorecards, comms downstream. |
| 9 | Capacity heat map on Reports | §2.8 Reports | Mid | 3 | 5 | S | 15.0 | Data already in DB; visually striking; wins Mid-segment demos. |
| 10 | Replenishment recommendations | §2.2 Inventory | All | 5 | 5 | M | 12.5 | Pairs directly with #2 (lead times) — without both, neither delivers value. The only M-effort item that earns its keep here. |

**Honourable mentions** (high-scoring but dropped from top-10 with reasons):
- **Variants-without-BOMs surface** (§2.1, score 16.0) — value depends on a mature BOM library; later-stage tool. Revisit once customers have substantial catalogues.
- **Per-order BOM override** (§2.3, score 12.5) — Job-shop persona only; deferred until Replenishment proves out.
- **Batch / lot tracking** (§2.4, score 12.5) — same expiry-tracking vertical play as #6 but M-effort instead of S; sequence after Expiry ships.
- **ABN + GST registration flag** (§2.7, score 12.0) — captured as part of the AU-native cluster (§4.3) even though just outside the top-10.

---

## 4. Strategic clusters

_(populated by Task 10)_

---

## 5. Out of scope

Ideas considered while writing this analysis but deliberately excluded from the priority list. Documented here to prevent re-litigation in three months.

- **Multi-currency throughout** — XL effort, blocks too much for too little before there are paying overseas-supplier customers. Revisit only when a customer signs who has overseas suppliers AND wants Assemblio as the source of truth.
- **Mobile-native iOS / Android apps** — the win is a good mobile web (PWA) for warehouse staff (covered indirectly via item #6 / receive UI). Native apps are a multi-quarter commitment with no clear payoff over PWA.
- **Real-time collaborative editing of BOMs** — sounds nice, but no evidence of demand and would consume an entire sprint that's better spent on the top-10.
- **Built-in CRM** — overlaps with Shopify; users already have HubSpot / Pipedrive. Stay in our lane.
- **Forecasting beyond moving average** — fancier ML demand forecasting before there's enough data is theatre. Naive 90-day moving average covers 80% of value (and is included in §2.8 table stakes).
- **Public REST/GraphQL API** — defer until we have ≥10 customers asking for it. Expensive to support, low marketing impact pre-launch.
- **White-label / multi-tenant for resellers** — premature. Multi-tenant works because the codebase is already tenant-isolated, but reseller-facing features (branding, billing splits) are a separate product.
