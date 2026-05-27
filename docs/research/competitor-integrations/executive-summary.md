# Competitor integrations executive summary

**Topic:** Competitor products' integration of Shopify, Etsy, Amazon, Xero, and QuickBooks
**Date:** 2026-05-13
**Source:** 28 researched items in `./results/*.json` (104 fields each, ~38% uncertainty rate)
**For:** Manuva positioning, roadmap, and competitive strategy

---

## TL;DR

The SMB / lower-mid-market segment where Manuva sits is crowded — 17+ direct rivals — but **nobody has all five named integrations done well end-to-end at the SMB price point.** Cin7 Core, Qoblex, and Zoho Inventory are the only products with native first-party connectors to all five (Shopify, Etsy, Amazon, Xero, QuickBooks) and each has material caveats. Three structural gaps are visible across the cohort:

1. **Settlement-aware accounting** is almost universally outsourced to A2X. The vendors don't post marketplace-facilitator tax cleanly to Xero/QBO themselves.
2. **Real-time webhook-driven multi-channel sync** is rare. Most do 5–60 minute polling.
3. **Native Amazon SP-API Inbound v2024-03-20** support is unconfirmed almost everywhere — Amazon's mandatory migration is in progress and the cohort is exposed.

Layer onto that a wave of consolidation (Stocky sunsets 2026-08-31, Finale was acquired by Descartes in Aug 2025, Inventory Planner is now Sage-owned, Veeqo is Amazon-owned), an AI-features inflection point that hit late 2025 / Feb 2026 (Katana ConverSight, Cin7 ForesightAI + Ask-Me-Anything, Odoo 19 native, Fishbowl AI Insights, Prediko, Cogsy), and 2026 pricing-model upheaval (Katana moved to usage-based Feb 2026, Veeqo is free). Manuva has 4–6 distinct angles to differentiate, of which the **A2X-grade accounting sync built natively** is the most defensible.

---

## 1. Market map — seven clusters

The 28 products group into seven clusters with very different buyer journeys.

### Direct SMB MRP rivals (closest to Manuva)
**Katana, MRPeasy, Unleashed, Fishbowl, Megaventory, Odoo.** This is the core competitive set.

- **Katana** is the design-twin: Shopify-first, Xero/QBO certified, VC-backed (€14M extension Oct 2025, ~$68.6M total). 4.5★ / 136 Shopify reviews. **Feb 2026 it moved to usage-based pricing on SO line items / GMV.** Effective price $747–$1,095/mo with add-ons (Manufacturing $199, Traceability $249, Warehouse $149). This is a *pricing opening* — and the price hikes are documented community complaints.
- **MRPeasy** is the EU/Tallinn-bootstrapped, code-by-code-tight competitor. Won Xero South Africa Small Business App of the Year 2025. **REST API gated behind the $149/user Unlimited tier**; webhooks limited to ~5 outbound status-change events. Strong manufacturing depth but API/extensibility is a sore point.
- **Unleashed** (Access Group, UK PE; acquired Nov 2020) has the deepest Xero DNA — perpetual COGS journals per movement, average landed cost, multi-currency, tracking-category mapping. But **Shopify is polled at ~15 min** (not webhook-driven), and Etsy/eBay/Walmart go via the third-party TIDE connector. Pricing: ~$349–$399/mo entry with paid add-on modules (Warehouse, Production, AIM, B2B).
- **Fishbowl** (US, Diversis Capital owned since 2021) is the QuickBooks-native rival. Both QBO and QB Desktop. **QBO sync requires Plus/Advanced tier only** — a friction point. Fishbowl Drive is reportedly Built-for-Shopify at 5.0★ / 89 reviews. AI Insights (2024–25) is ConverSight-powered.
- **Megaventory** is a real outlier — strong manufacturing, but **no native Xero, Amazon, or Etsy** (all Zapier-only). QBO is push-only.
- **Odoo** is the open-source escape valve — €5B valuation Nov 2024 (CapitalG/Sequoia secondary). Odoo 19 (Oct 2025) added **native AI demand forecasting + reorder rules + AI assistant**. Native Amazon SP-API across 20 marketplaces. **No native Xero/QBO** — Odoo runs its own ledger.

### Multi-channel inventory + light manufacturing
**Cin7 Core, Cin7 Omni, Zoho Inventory, inFlow, Qoblex, Finale.** This is the "we do everything mid-stack" cluster.

- **Cin7 Core (formerly DEAR Systems)** is the strongest all-rounder on integrations — native Shopify, Etsy, Amazon (18+ marketplaces), Xero, QBO; Xero Global App Awards 2025 finalist; acquired Inventoro for AI (ForesightAI + "Ask Me Anything" NL-query, Aug 2025). **Inventory sync to Shopify is one-way only** (Core → Shopify) — that's a soft spot. Pricing: $349/$599/$999/mo.
- **Cin7 Omni** (upmarket sibling) has **native EDI** (Amazon Vendor, Walmart, Target) and 3PL portal — 500+ integrations. But **Shopify App Store rating is 1.8★ / 26 reviews**, and **Shopify Markets explicitly NOT supported**. Custom pricing (~$1k–3k+/mo).
- **Zoho Inventory** has native Shopify multi-store, Amazon FBA+FBM, Etsy, eBay, QBO + Xero — but **items don't sync** with QBO or Xero in either direction (only invoices/bills). Pricing $29/$79/$129/$249/mo. Free under 50 orders. Tightly couples with Zoho Books.
- **inFlow** has a serious Shopify problem — the inFlow Connector app is rated **1.3★** on the App Store. QBO/Xero are one-way push, periodic COGS only. Etsy/eBay/Walmart route through Extensiv (CartRover). Pricing $110–$1,319/mo with API as paid add-on ($29–$69).
- **Qoblex** (rebranded from Stock&Buy Q1 2024) is the dark horse — **Xero Global App Awards 2025 Finalist** (CA/ZA/Asia), 4.9★ on Shopify (~60 reviews), ~5-min Xero sync cadence. BOM with assembly/disassembly, multi-warehouse, B2B portal ($49/mo add-on). Etsy and Amazon depth uncertain.
- **Finale Inventory** was **acquired by Descartes in August 2025** for ~$40M cash + $15M earn-out. Now "Descartes Finale Inventory." Native Shopify/Amazon/Etsy/Walmart/TikTok/QBO/Xero. **A2X is the recommended Amazon settlement partner — Finale doesn't natively post MFT.**

### Mid-market retail ops
**Brightpearl, Linnworks, Veeqo, Extensiv.**

- **Brightpearl** (Sage-owned since Jan 2022, ~$340M acquisition) is the gold-standard integration story. **Shopify Plus Certified App Partner; one of three partners in the Shopify Global ERP Program; Shopify uses Brightpearl to fulfill its own hardware.** Supports Shopify Plus B2B, POS, Markets, and **metafield → ERP field mapping** (genuine differentiator). 4.6★ / 52 Shopify reviews. Mid-market pricing: $1k–$3k+/mo plus ~$35k implementation.
- **Linnworks** (Marlin Equity; acquired SkuVault Sept 2022) has native connectors to 100+ marketplaces — Amazon, eBay, Etsy, Walmart, TikTok, Wayfair, Temu, SHEIN, Fruugo. **But no native Xero or QuickBooks** — customers use SyncTools or partner connectors. Quarterly release cadence.
- **Veeqo** (Amazon-owned since Nov 2021) is now **completely free** for all sellers — monetises via shipping label margin + 5% Amazon Buy Shipping credit. Big caveats: **Xero closed to new connections**; QBO only via third-party (TheGenieLab); Etsy automated orders closed to new US connections after Oct 21, 2024; **no BOM, no work orders, no lot tracking**. Shopify rating 2.8★. Amazon side is deep — FBA inbound visibility, all marketplaces, Buy Shipping baked in.
- **Extensiv** (formerly Skubana / 3PL Central; ~$146M raised, Mainsail Partners) is the multi-product suite — 3PL Warehouse Manager (WMS), Order Manager (formerly Skubana), Integration Manager (CartRover, iPaaS), Network Manager. Mid-market and 3PL-focused. **Xero is shallow** (treats invoices as orders), QBO is the deeper integration. 110+ ecom integrations, 80+ EDI partners.

### Shipping/inventory hybrids
**Ordoro.**

- **Ordoro** has native Shopify with Instasync real-time webhooks, native QBO (Feb 2023, **Premium plan only, shipped orders only, no autosync**), **no native Xero** (notable given the Shopify-heavy base), Amazon native but **only US/CA/UK** and **Professional accounts only**. Last funding 2015 — vendor-stability question.

### WMS / QuickBooks add-on
**SkuVault Core, Acctivate.**

- **SkuVault Core (Linnworks Warehouse)** is WMS-focused — kitting, lot/serial/bin, multi-warehouse, but **no manufacturing BOMs, no work orders, no landed cost**. Shopify App Store rating **1.0★** on its standalone listing. Xero is via APIWORX/DBSync third-party. Reviews note declining support post-Linnworks acquisition.
- **Acctivate** (Alterity → acquired by CAI Software, Aug 2023) is QuickBooks-only — bi-directional QBO/QB Desktop, no Xero, no Etsy, no direct Amazon (via ShipStation). **No public REST API, no outbound webhooks, no Zapier** — XML schema or direct SQL Server access only. Strong on multi-level BOMs, WIP/yield variance, landed cost.

### Vertical / DTC specialists
**Craftybase, Sumtracker, Prediko, Cogsy, Inventory Planner, Stocky.**

- **Craftybase** is the maker-vertical leader (Etsy-first). **Launched QBO COGS + Inventory Valuation Sync in Dec 2025** (summary-journal mode, tax excluded). Xero is in-progress (not yet shipped). No public API, no webhooks, no Zapier. Pricing $20–$291/mo.
- **Sumtracker** (Delhi, founded 2022, bootstrapped, ~$1M ARR) is a thin multi-channel sync layer with **bundle decomposition** as its flagship feature. No BOM/work orders/lot/serial. **No native Xero or QuickBooks** — relies on A2X-style middleware.
- **Prediko** (London, $5M seed Felix Capital May 2022) is Shopify-native AI forecasting. **Shopify-only — Amazon on waitlist, no Etsy/eBay/Walmart/QBO native.** Native Xero PO-to-Bill push (confirmed). 4.9★ / 208 Shopify reviews. AI trained on 25M+ SKUs. Auto production orders when SKUs with BOMs are ordered.
- **Cogsy** (Austin, $6M seed Accel/Bain Dec 2021) is pure finished-goods demand planning. 12-month forecast, ~92% claimed accuracy. **No BOM, no lot, no serial.** Customers: Caraway, Lalo, Olipop.
- **Inventory Planner by Sage** (Brightpearl acquired in 2021, Sage acquired Brightpearl in 2022) is **read-mostly** across Shopify/Amazon/QBO/Xero. Periodic sync, not real-time. The only major write-back is purchase orders. Custom revenue-based pricing, mandatory 12-month auto-renewing contract is a documented complaint.
- **Stocky by Shopify** is **end-of-life — delisted 2026-02-02, fully sunset 2026-08-31.** Min/max forecasting + transfers already removed July 2025. **Historical data does not auto-migrate to Shopify Admin** and must be manually exported. This is a real, time-bounded customer migration window through end of August 2026.

### Upmarket / enterprise benchmarks
**Xentral, NetSuite.**

- **Xentral** (Augsburg, founded 2008; $75M Series B Aug 2021 Tiger Global + Sequoia) is the German DTC-ERP. Native Shopify, Amazon, eBay, TikTok, WooCommerce, Shopware, Magento. **DATEV-centric accounting** — Xero/QBO supported as export-only (invoice/credit/payment). Repositioning as "AI ERP for Scaling Commerce." Customers: YFood, KoRo, AirUp, Pink Gellac.
- **NetSuite** is the price ceiling. ~$999/mo base + $99–$149/user/mo, ~10-user minimum. **Owns the SuiteApp Connector for Shopify** (formerly FarApp, acquired 2021). Strong Amazon native (FBA + FBM + Vendor Central + settlement import). No Etsy native. Xero/QBO are migration projects, not ongoing sync. Gartner Magic Quadrant Leader for Cloud ERP 2025.

### Reference benchmark (not a competitor)
**A2X** is the dominant Shopify/Amazon/Etsy/eBay/Walmart → Xero/QBO/Sage/NetSuite settlement-reconciliation layer. **Won Xero US Small Business App of the Year 2025.** This is the accounting-sync benchmark Manuva should aspire to match natively — see Section 4.

---

## 2. The five integration battlegrounds

### Shopify — the most contested, the most uneven

**State of the art:** Native, webhook-driven, real-time, Built for Shopify badge, Plus Certified App Partner, supports Shopify Markets (multi-currency/duties/landed cost), Shopify B2B catalogs, POS, metafield → ERP custom-field mapping, service items, and bi-directional sync of products/variants/inventory/orders/customers/fulfillments/refunds.

**Who delivers it:** Brightpearl is the closest to perfect. Fishbowl Drive claims BFS at 5.0★ but on a small review base. Cin7 Core is broad but inventory sync is **one-way** (Core → Shopify).

**Table stakes for 2026:** Real-time webhooks, multi-store, variant SKU mapping, service items, refunds, and POs (Katana shipped service items in 2025 and the supplement agent flagged it as now-expected).

**Where everyone is weak:** Shopify Markets and B2B catalog handling. Beyond Brightpearl (and to a partial extent Cin7 Omni — except Omni explicitly does NOT support Markets), nobody in this cohort handles them well. Metafield mapping is essentially Brightpearl-only at SMB scale.

**Ratings reality check:** SkuVault 1.0, inFlow 1.3, Cin7 Omni 1.8, Veeqo 2.8, Stocky 2.9–3.3. Strong: Prediko 4.9 (208), Cogsy 4.9 (small), Qoblex 4.9 (60), Brightpearl 4.6, Katana 4.5, Craftybase 4.4.

### Etsy — the gap that most SMB MRPs ignore

**Native first-party:** Craftybase (strongest), Cin7 Core, Zoho Inventory, Linnworks, Finale, Sumtracker, Inventory Planner, Veeqo (closed to new US automated orders after Oct 2024), Prediko (no — on waitlist), Ordoro (sync-only).

**Not native (third-party or none):** Katana (Extensiv/Make/Zapier), Fishbowl, MRPeasy (Zapier), Megaventory (Zapier), Unleashed (TIDE), inFlow (CartRover/Zapier), Brightpearl (uncertain), Acctivate (no), Stocky (no), Xentral (no), NetSuite (third-party SuiteApps).

**Listing creation:** Almost nobody supports it. Sync-only is the norm. Craftybase handles Etsy variations and personalization best.

**Why it matters:** Etsy is the bottom-of-funnel for makers and small DTC. Manuva targeting that segment and shipping a real Etsy integration (not Zapier) is meaningful differentiation against Katana, MRPeasy, Unleashed.

### Amazon — the deepest moat to build, the riskiest place to be exposed

**Native SP-API breadth:** Odoo (~20 marketplaces), Cin7 Core (18+), NetSuite (all majors + Vendor Central), Brightpearl, Linnworks, Veeqo (all marketplaces, deep).

**Limited:** Ordoro (US/CA/UK, Professional only). Craftybase (US only). MRPeasy (FBM-oriented; FBA limited after old API deprecation). Acctivate (via ShipStation).

**SP-API Inbound v2024-03-20:** This is a sweep opportunity. The migration is mandatory and **almost no vendor confirms it publicly.** Katana, Cin7 Core, Cin7 Omni, Fishbowl, Unleashed, Brightpearl, Linnworks, Veeqo, Finale, Odoo, NetSuite — all uncertain. Vendors who haven't migrated will lose FBA inbound functionality. Manuva shipping this confirmed and visibly is real protection.

**Amazon Buy Shipping (in-app label purchase):** Veeqo is the benchmark (free for Amazon sellers). NetSuite has it. Most others don't or are uncertain.

**Settlement report handling:** Almost everyone outsources to A2X (Finale openly recommends A2X; Brightpearl has partial native; Cin7 Omni has MFT tax mapping for Amazon only; NetSuite has it). For the others, settlement reconciliation is uncertain or absent. **This is the single biggest gap in the cohort.**

**Marketplace-facilitator tax:** Brightpearl handles it. Cin7 Omni handles it (Amazon only). A2X handles it (all marketplaces it supports). NetSuite handles it. Almost everyone else is uncertain or absent.

### Xero — where awards signal real depth

**Xero Global App Awards recognition (2025):** A2X (US Small Business App of the Year), MRPeasy (ZA Small Business App of the Year), Qoblex (Finalist CA/ZA/Asia), Cin7 Core (Finalist AU). Unleashed won in 2019 (still a deep integration). These five represent the depth tier.

**Sync mode landscape:**

- **Summary journal (A2X-style):** A2X, Craftybase (QBO only, via summary journal launched Dec 2025), Linnworks (via third-party), Finale (hybrid — both summary and detail).
- **Invoice-per-order with perpetual COGS:** Katana, Cin7 Core, Cin7 Omni, Unleashed, Fishbowl, Qoblex, Brightpearl, Veeqo, MRPeasy (configurable).
- **MRPeasy uniquely offers both modes** — user-toggle invoices-only vs. full journals.

**Tracking categories:** A2X is the exemplar (per-line, per-marketplace assignment). Cin7 Core supports 2 tracking categories. Unleashed maps natively. Brightpearl yes. Most others uncertain.

**Multi-currency:** Most claim it. The depth question is whether inventory valuation is held per-currency or single base — most are uncertain on this.

**The losers:** Acctivate (no Xero), Cogsy (data only), Linnworks (no native), Ordoro (no Xero), SkuVault (third-party), Stocky (no), Craftybase (in progress), Prediko (POs only), Sumtracker (no native), Megaventory (Zapier-only).

### QuickBooks — QBO is universal, Desktop is rare, tier-locking is rampant

**QBO native:** Nearly all 28.

**QB Desktop native:** Fishbowl, Acctivate, SkuVault Core, NetSuite (no), Brightpearl (via plug-and-play), Cin7 Core no, Katana no, Unleashed no — most cloud-only SaaS skip Desktop.

**Tier-locking gotchas:** Fishbowl QBO requires **Plus/Advanced only**. Cin7 Core requires Plus/Advanced. Ordoro QBO requires Premium plan. These tier requirements are documented friction Manuva can avoid.

**Sync modes:** Mostly the same fork as Xero — invoice-per-order with perpetual COGS dominates, A2X / Craftybase / Finale show that summary-journal works at the SMB tier.

**Class/Location mapping:** A2X (full), Fishbowl (Classes), Cin7 Core (Class + Location), most others uncertain.

---

## 3. Cross-cutting trends

### Ownership churn 2024–2026

| Vendor | Change | Date |
|---|---|---|
| Stock&Buy | Renamed Qoblex | Q1 2024 |
| Cin7 | $500M continuation fund (CVC, Ares, BlackRock, Goldman) | Nov 2024 |
| Odoo | €500M secondary at €5B valuation (CapitalG, Sequoia) | Nov 2024 |
| Finale Inventory | Acquired by Descartes ($40M + $15M earn-out) | Aug 2025 |
| Katana | €14M Series B extension | Oct 2025 |
| Stocky | Delisted, sunsetting 2026-08-31 | Feb–Aug 2026 |

Add older context: Brightpearl→Sage (Jan 2022, $340M), Inventory Planner→Brightpearl→Sage (Sep 2021 + Jan 2022), Veeqo→Amazon (Nov 2021), Stocky→Shopify (2020), Linnworks→Marlin Equity (acquired SkuVault Sep 2022), Acctivate→CAI Software (Aug 2023), Unleashed→Access Group (Nov 2020), Fishbowl→Diversis Capital (Dec 2021). **The independent SMB MRP set is small** — Katana, MRPeasy, Megaventory, Qoblex, Odoo, Ordoro, Sumtracker, Prediko, Craftybase, Xentral. Everyone else has been acquired or rolled up.

### AI inflection — fall 2025 / Feb 2026

In a 6-month window the entire cohort gained ML features:

- **Cin7 Core "Ask Me Anything"** NL query (Aug 2025) — first-mover on conversational inventory.
- **Odoo 19 native AI demand forecasting + AI assistant + auto-PO/MO** (Oct 2025).
- **Craftybase QBO COGS Sync** (Dec 2025) — not AI, but signal that vertical players are catching up.
- **Cin7 ForesightAI / Inventoro acquisition** — demand forecasting + Smart Reorder/Smart Buyer.
- **Katana ConverSight integration** for AI BI / conversational queries (Feb 2026).
- **Fishbowl AI Insights** (ConverSight-powered, 2024–25) — forecasting, recommended POs, part shortage summaries, NL query.
- **MRPeasy** Power BI integration Mar 2025; marketed as "AI-powered" but largely rule-based.
- **Xentral** agentic AI roadmap for purchasing/disposition/accounting; GA dates uncertain.
- **Prediko** 25M-SKU forecasting model; AI PO suggestions.
- **Cogsy** 12-month AI forecasting, ~92% claimed accuracy.

NL query specifically is emerging but only Cin7 Core and Fishbowl have shipped it. Manuva shipping a credible "ask your inventory" feature in 2026 puts it in a 2-product peer set.

### Pricing model upheaval

- **Veeqo:** Free for all sellers (Amazon plays the monetisation game via Buy Shipping margin and credits).
- **Katana:** Moved to **usage-based pricing on SO line items / GMV** in Feb 2026, with documented community pushback on price hikes.
- **NetSuite:** Per-user pricing, ~10-user minimum, ~$2,000–$3,000+/mo entry.
- **Brightpearl:** Custom-quoted, ~$1k–$3k+/mo + ~$35k implementation, no trial.
- **Cin7 Core:** $349/$599/$999/mo tiered.
- **Most SMB rivals:** $79–$349/mo entry.

Pricing opacity at the mid-market tier is hurting Manuva-tier-buyer trust. Transparent published pricing is a cheap signal.

---

## 4. Where Manuva can credibly differentiate

These are ordered by defensibility. The first one is the keystone.

### Differentiation angle 1 — A2X-grade settlement & MFT handling, built natively

**The gap:** Almost the entire cohort outsources Amazon settlement reconciliation, Shopify payout reconciliation, and marketplace-facilitator tax journaling to A2X. Finale explicitly recommends A2X. Sumtracker tells you to use A2X-style middleware. Among the MRP/inventory tier, only Brightpearl, NetSuite, and partially Cin7 Omni post settlement-aware journals with proper MFT separation natively — and they're $1k+/mo upmarket products.

**The opportunity:** Manuva ships native settlement-aware Xero + QBO sync with:

1. Summary-journal posting per Amazon settlement / Shopify payout / Etsy-eBay payout (matches the deposit).
2. Per-line Xero tracking-category / QBO Class+Location mapping at marketplace granularity.
3. Marketplace-facilitator tax recognised and split to a sales-tax-liability balance-sheet account (so revenue isn't inflated).
4. Per-channel toggle between summary-journal and invoice-per-order, with B2B going invoice-per-order even on Shopify (A2X already does this for Shopify B2B).
5. Settlement-spans-month-end auto-split into correct GL periods.

If Manuva ships this end-to-end at SMB pricing, the value prop becomes "Manuva replaces both your inventory tool AND A2X" — a single-vendor win that the cohort can't credibly counter without rebuilding.

### Differentiation angle 2 — Real-time webhook-driven multi-channel sync with documented rate-limit handling

**The gap:** Real-time sync is fragmented. Brightpearl, Katana, Ordoro Instasync, Prediko, Qoblex (~5 min) lead. Unleashed (15 min poll), Cin7 Core (15 min Shopify product download), Finale (5 min poll), Acctivate (5/15/30/60 min), MRPeasy (poll, no order webhook), Inventory Planner (batched), Stocky (now end-of-life) lag. **Almost nobody publishes rate-limit handling docs.** Almost nobody publishes a public status page (Megaventory is one of the few exceptions in the cohort).

**The opportunity:** Webhook-driven on every channel with explicit rate-limit handling documented, a public status page with uptime numbers, and a published webhook event catalog. These are cheap signals but rare. Manuva ships these as part of trust-building and gets a documented advantage in side-by-side evals.

### Differentiation angle 3 — All five integrations native, at high quality, with bin-aware manufacturing

**The gap:** Only Cin7 Core, Qoblex, Zoho Inventory cleanly support all five named integrations native first-party. Cin7 Core ships one-way Shopify inventory sync. Qoblex's Etsy and Amazon depth is unconfirmed. Zoho Inventory doesn't sync items with QBO or Xero in either direction.

**The opportunity:** Native first-party Shopify (real-time, BFS-eligible quality) + Etsy (sync incl. variations) + Amazon (SP-API, FBA, settlement) + Xero (Awards-credible) + QuickBooks (QBO + Desktop ideally) + bin/sublocation manufacturing in a single product at SMB pricing. There is no current product that does all six well. Manuva landing this is a clean buyer story.

### Differentiation angle 4 — Confirmed Amazon SP-API Inbound v2024-03-20

**The gap:** Amazon's mandatory migration to the v2024-03-20 Fulfillment Inbound API is in progress. Almost no vendor confirms migration status publicly. Vendors who haven't migrated will lose FBA inbound functionality and silently break.

**The opportunity:** Ship the v2024-03-20 inbound workflow confirmed and prominently documented. Use it in competitive battlecards as a question to ask competitors who can't answer. This is a 12-month edge before everyone catches up.

### Differentiation angle 5 — Stocky migration play (time-bound, ends 2026-08-31)

**The gap:** Stocky is sunsetting on 2026-08-31. Shopify is absorbing its core features into Admin but **historical data does not auto-migrate** — POs, stocktakes, and history must be manually exported. Reviews already skew negative on Stocky's UX, and Prediko / Cogsy are positioned to capture POS-merchant migrations but neither has a published "Stocky → us" tool.

**The opportunity:** Ship a Stocky importer that pulls POs, stocktakes, suppliers, and reorder-point history from Stocky exports (CSV/JSON). Combine with a clearly priced migration package and a "no manual re-entry" promise. Run a 90-day campaign April–July 2026 explicitly targeting Stocky merchants. Time-bound but high-intent buyer pool.

### Differentiation angle 6 — Per-user pricing tax avoidance + transparent pricing

**The gap:** Most SMB rivals charge per user (Unleashed $349+, MRPeasy $49–149/user, Cin7 Core $349+, Fishbowl per-user, Acctivate $79–149/user, NetSuite $99–149/user with 10-user min). Many gate API access behind the top tier (MRPeasy $149 Unlimited, inFlow $29–69 add-on, Ordoro Premium+, Acctivate XML/SQL only).

**The opportunity:** Site-licence pricing (no per-user fee), all integrations included, public API on day one without gating. Transparent published pricing with no "contact sales" gates at SMB tier. This is positioning, not technology — but it tips comparison checklists.

---

## 5. Watch list — who to track quarterly

| Vendor | Why | Signal to monitor |
|---|---|---|
| **Cin7 Core** | Closest direct rival with most-native integrations. ForesightAI + AMA already shipped. | Quarterly release notes — especially Shopify two-way inventory and any Etsy listing-creation. |
| **Katana** | Closest design twin. Pricing model in flux. Feb 2026 ConverSight integration. | Pricing model evolution + AI roadmap + service-item-equivalent shipping. |
| **Qoblex** | Xero-aligned, fast-moving, recent rebrand. | Capture of Xero awards finalist→winner momentum. Amazon depth. |
| **Prediko** | Shopify+Xero focused, AI native, raised €5M. | Amazon GA (currently waitlist). |
| **A2X** | The "missing accounting layer." | Partnership or competition signal — if A2X moves into inventory, it's competitive; if not, it's a partnership candidate. |
| **Brightpearl** | Upmarket integration benchmark. | Markets/B2B/Plus enhancements that drift down-market. |
| **Odoo** | Open-source escape valve. Odoo 19 AI shipped. | Native Xero/QBO connector (would be a big swing). |
| **Stocky** (sunsetting) | Time-bound migration opportunity. | Shopify Admin absorption progress; merchant migration announcements. |
| **Fishbowl** | QuickBooks-native, US-heavy, AI Insights. | Cloud SKUs (Drive, Advanced) take rate vs. on-prem decline. |
| **Veeqo** | Free price disruption. Amazon-owned. | Whether Amazon expands integration depth to other accounting/inventory categories. |

---

## 6. One-line takes on each of the 28

1. **Katana MRP** — Closest design twin. Real-time Shopify, native Xero/QBO. Pricing model just shifted usage-based; community grumbling. Buy: pricing predictability.
2. **Fishbowl** — QuickBooks-native, US-heavy. Strong manufacturing depth. QBO sync gated to Plus/Advanced. AI Insights via ConverSight.
3. **Unleashed** — Xero-deepest in cohort, multi-currency-strong. Shopify is 15-min polled (not real-time). Etsy/Walmart via TIDE third-party.
4. **MRPeasy** — Tight, bootstrapped, strong manufacturing. REST API gated to $149 tier. Won Xero ZA App of the Year 2025.
5. **Megaventory** — Real outlier: no native Xero/Amazon/Etsy (Zapier-only). Strong manufacturing+landed cost. Public status page (rare).
6. **Odoo 19** — €5B valuation. Native Amazon SP-API across 20 marketplaces. No native Xero/QBO (uses own ledger). AI features shipped Oct 2025.
7. **Cin7 Core (DEAR)** — Strongest all-rounder on integrations. Shopify inventory is one-way only. Xero Global App Awards Finalist 2025 AU.
8. **Cin7 Omni** — Native EDI, 500+ integrations. Shopify rating 1.8★. Shopify Markets explicitly NOT supported.
9. **Zoho Inventory** — Multi-channel breadth, but **items don't sync with QBO or Xero**. Tight Zoho Books coupling.
10. **inFlow** — Shopify rating 1.3★ (serious problem). QBO/Xero one-way push, periodic COGS. Etsy/Walmart via Extensiv CartRover.
11. **Qoblex** — Xero Global Award Finalist 2025. Rebranded from Stock&Buy Q1 2024. 4.9★ / 60 Shopify reviews. Etsy/Amazon depth unconfirmed.
12. **Finale (Descartes)** — Acquired Aug 2025 for ~$40M. Native Shopify/Amazon/Etsy/Walmart/TikTok/QBO/Xero. A2X recommended for Amazon settlement.
13. **Brightpearl (Sage)** — Upmarket integration gold standard. Shopify Plus Certified, Global ERP Program member. Metafield → ERP mapping (rare). Mid-market pricing.
14. **Linnworks** — 100+ marketplaces native. **No native Xero or QBO** — third-party connectors only.
15. **Veeqo (Amazon)** — Free for all sellers. **Xero closed to new connections.** QBO via third-party. No BOM/work orders. Amazon-side deep, Buy Shipping baked in.
16. **Extensiv** — Skubana + 3PL Central + CartRover + Network. Mid-market. Xero shallow, QBO deeper. 80+ EDI partners.
17. **Ordoro** — Real-time Shopify Instasync. **No native Xero.** QBO since Feb 2023 (Premium plan, shipped orders only). Last funding 2015 — vendor-stability flag.
18. **SkuVault Core** — WMS-focused. No manufacturing, no landed cost. Shopify rating 1.0★. Xero via APIWORX/DBSync. Support declining post-Linnworks.
19. **Acctivate** — QuickBooks-only (QBO + Desktop bi-directional). **No public API, no webhooks, no Zapier.** Strong manufacturing.
20. **Craftybase** — Maker/Etsy vertical leader. QBO COGS Sync shipped Dec 2025. Xero in-progress. **No public API/webhooks/Zapier.**
21. **Sumtracker** — Bundle decomposition flagship feature. Bootstrapped India, ~$1M ARR. No BOM, no native Xero/QBO.
22. **Prediko** — Shopify-only AI inventory + Xero PO push. Amazon on waitlist. 4.9★ / 208 Shopify reviews. AI trained on 25M+ SKUs.
23. **Cogsy** — Pure DTC demand planning. 12-month forecast. Notable customers: Caraway, Lalo, Olipop. No BOM/lot/serial.
24. **Inventory Planner by Sage** — Read-mostly across channels. Mandatory 12-month auto-renewing contract is a documented complaint.
25. **Stocky (Shopify)** — **End-of-life: delisted 2026-02-02, sunset 2026-08-31.** Migration opportunity for time-bound campaign.
26. **Xentral** — German DTC ERP, DATEV-centric. Xero/QBO are export-only. AI ERP repositioning underway.
27. **NetSuite (Oracle)** — Price ceiling at ~$1,000+/mo + $99–149/user. Owns Shopify Connector SuiteApp. No native Etsy. Gartner MQ Leader 2025.
28. **A2X** — **Reference, not competitor.** Won Xero US Small Business App of the Year 2025. The accounting-sync benchmark Manuva must match natively.

---

## Files in this research bundle

| File | Use |
|---|---|
| `outline.yaml` | Items and execution config — edit to re-run subsets |
| `fields.yaml` | 14-category, 104-field schema |
| `results/*.json` | 28 per-product structured JSONs |
| `report.md` | Full detailed report (4,304 lines) generated from JSONs |
| `comparison-matrix.csv` | 28 rows × 60 columns for spreadsheet analysis |
| `executive-summary.md` | This document |
| `generate_report.mjs` | Regenerates `report.md` from JSONs |
| `build_comparison_matrix.mjs` | Regenerates the CSV |
