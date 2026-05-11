# Integrations strategy — competitive landscape & gap analysis

**Date:** 2026-05-11
**Status:** Strategic analysis (no implementation plan attached)
**Companion doc:** [`2026-05-11-competitive-analysis.md`](./2026-05-11-competitive-analysis.md) — the feature-matrix view. This doc goes deep on *integration behaviour* rather than presence.
**Scope:** WooCommerce, Amazon AU, Etsy, eBay AU on the channel side; Xero, QuickBooks Online, MyOB on the accounting side. Shipping platforms (Starshipit / Shippit / ShipStation) and payout connectors (A2X / Link My Books / Synder) covered as adjacent context. Cross-channel inventory deduction is explicitly **out of scope** (per brainstorm decision — assumption: Manuva customers ship their own stock).
**Target customer:** AU/NZ SMB manufacturers.

---

## Part 1 — Executive summary

### The two strategic questions

1. **Where is the competitive floor we must match** so we stop losing deals on the discovery call to "do you connect to X?"
2. **Where is the gap nobody is filling** that Manuva can own?

### The floor (table stakes)

Across Katana, Cin7 Core, MRPeasy, Craftybase, Qoblex, inFlow, Unleashed, and Fishbowl, the **deal-breaker floor is nine integrations**:

> Shopify · WooCommerce · Amazon · eBay · Xero · QuickBooks Online · Starshipit (or ShipStation) · Zapier · *and for AU-first positioning,* MyOB

Manuva currently has **one** of these (Shopify). Every other integration is missing.

### The gap

Three findings from the deep dive that, taken together, define Manuva's opportunity:

1. **MyOB is unoccupied territory.** Katana has no MyOB. Cin7 Core has no MyOB. MRPeasy has no MyOB. Craftybase has no MyOB. The third-party MyOB connectors that exist (e.g. SAAS Integrator) target Acumatica, not AccountRight/MyOB Business. For an AU-first manufacturing SaaS, this is the single clearest differentiation that costs the same to build as the others on the floor list.

2. **Xero + Etsy + eBay together is unoccupied territory.** Craftybase has Etsy depth but no Xero and no eBay. MRPeasy has Xero but no native Etsy and no native eBay. Cin7 Core has all three but is priced above the AU SMB segment ($349/mo Standard, and each storefront consumes one integration license). No tool in the $99–$249 segment covers AU's three highest-impact non-Shopify marketplaces alongside Xero.

3. **Manuva's manufacturing-cost data is the one accounting story A2X-class connectors can't tell.** A2X reconciles revenue (gross sales / fees / refunds / payouts → bank deposit). It has no concept of BOM, real cost, work-in-progress, yield, scrap, labour absorption, landed cost, or purchase-price variance. **Those are the journals Manuva can post that nobody else can.** MRPeasy already posts a daily WIP/FG/COGS journal to Xero/QBO — but it's batched/daily, not per-production-order, and has no variance breakdown. Manuva can be best-in-class here without breaking new conceptual ground.

### Sequencing recommendation (preview — full version in Part 6)

1. **Xero — go deeper than Katana, match Cin7 Core's per-channel consolidation.** Foundation accounting story.
2. **MyOB AccountRight (and MyOB Business) — be the first credible AU manufacturing connector.** Differentiation play.
3. **Schema migration: decouple `orders` from `shopify_order_id`** — must happen before any second sales channel ships.
4. **WooCommerce — easiest second channel.** REST + webhooks, no marketplace gatekeeper.
5. **Amazon SP-API — required for AU SMB credibility.** Bigger build (PII restrictions, FBA vs FBM, marketplace app approval).
6. **eBay (EBAY_AU) and Etsy.** Native, with full fulfilment writeback (beating Katana's Extensiv-routed limitations).
7. **QuickBooks Online — match Xero parity.** For US expansion later.
8. **Shipping handoff (Starshipit first, AU-native).**

Specs and plans follow per integration; this doc is the basis for picking which to spec first.

---

## Part 2 — Sales-channel integrations

### 2.1 Platform-by-platform API reality

#### WooCommerce

REST API at `/wp-json/wc/v3/`, Consumer Key + Consumer Secret per store (HTTP Basic over HTTPS). No vendor sandbox — spin up a test WordPress site. **No central rate limit on the core REST API** — constrained only by the host's web server. Webhooks are first-class (`order.created`, `order.updated`, `order.deleted`, `product.*`, `customer.*`) with HMAC-SHA256 signatures. Variable products use a parent + child `variation` model with per-variation SKU/price/stock. Full customer PII on every order, no restrictions. Native fulfilment status is just the order transitioning to `completed` — tracking numbers require a plugin (typically Shipment Tracking).

**Manuva-relevant gotchas:** (a) auth is per-store, not per-app — connecting 100 merchants means storing 100 key pairs; (b) the WooCommerce *ecosystem* is plugin-driven, so two stores on the same Woo version can have wildly different schemas (custom fields via ACF, multi-currency via Aelia, multi-location via ATUM); (c) FastCGI or security plugins sometimes strip the `Authorization` header — fall back to query-string keys; (d) no SLA on rate limits, cheap shared hosts can throttle at the web-server layer silently. ([docs](https://woocommerce.github.io/woocommerce-rest-api-docs/))

#### Amazon Selling Partner API (SP-API), Amazon.com.au

Amazon AU sits in the **Far East regional cluster** (with Japan and Singapore) — endpoint `https://sellingpartnerapi-fe.amazon.com`, marketplace ID **`A39IBJ37TRP1C6`**. Auth: Login-with-Amazon OAuth 2.0 with refresh tokens. Restricted (PII-bearing) operations require a Restricted Data Token from the Tokens API. App registration requires a developer account in Seller Central + a Solution Provider Portal listing. Rate limits use a token-bucket per operation per seller-app pair, exposed via `x-amzn-RateLimit-Limit` headers.

**Listings:** keyed by ASIN — every SKU either matches an existing ASIN or triggers ASIN creation via the Product Type Definitions API. **UPC/EAN/GTIN required** unless the seller has Brand Registry + GTIN exemption. **Orders:** polling-only via `GET /orders/v0/orders`, but the Notifications API can push `ORDER_CHANGE` events via SQS or EventBridge. **PII restriction:** buyer name, email, shipping address are restricted; calls require an RDT and a documented approved use case.

**AU-specific gotchas (critical):**
1. **Amazon.com.au is a separate seller account.** There is no NA-equivalent unified account spanning AU; AU sits with JP/SG. A US seller cannot attach AU to an existing account — they register a fresh AU account and re-authorise the SP-API app.
2. **Legacy MWS retired (2024)** — anything still referencing MWS must be migrated.
3. **GST collection**: Amazon may collect GST on AU-bound low-value imports; this appears in `OrderTotal`/`TaxCollection` and is frequently double-counted by integrations.
4. **AU product category gating** (supplements, electrical) is enforced independently of US gating.

**FBA vs FBM** is set per-SKU in `fulfillment_channel`. FBA inventory lives at Amazon's warehouse and is read-only from the seller's side via `GET /fba/inventory/v1/summaries`. ([docs](https://developer-docs.amazon.com/sp-api/))

#### Etsy Open API v3

REST, JSON, base `https://openapi.etsy.com/v3/application/...`. **OAuth 2.0 with PKCE is mandatory** — no client-secret-only flow. Production access requires Etsy to approve the app (until then, capped to the developer's own shop). **Rate limit: 10 QPS and 10,000 QPD per app key, combined across all merchant tokens.** This is a brutal constraint for multi-tenant SaaS — 10k QPD shared across every shop onboarded.

Etsy is **listing-centric, not product-centric**: every SKU-bearing thing is a `Listing`. Variations come via `updateListingInventory` — a `PUT`-style full-document replace. **A partial payload silently wipes any variation you don't include.** Properties are taxonomy-bound: query `GET /seller-taxonomy/nodes` and `/seller-taxonomy/nodes/{taxonomy_id}/properties` for legal values per category.

**Orders are called "Receipts."** Polling-only — **Etsy does not offer outbound webhooks.** Buyer name + shipping address exposed without restriction (scopes `transactions_r` + `address_r`).

**AU gotchas:** Etsy is global — etsy.com is the same surface for AU sellers as US sellers. Currency is set per-shop, no mixing. **GST on imports:** Etsy collects and remits GST on AU-bound low-value imports; this appears in `total_tax_cost` and is easy to misclassify as seller revenue. ([docs](https://developers.etsy.com/documentation/))

#### eBay (Sell APIs), EBAY_AU

REST, JSON, base `https://api.ebay.com/sell/...`, sandbox available. OAuth 2.0 with Authorization Code grant for `sell.*` scopes. Apps registered in eBay Developers Program with separate Sandbox and Production keysets. Default per-resource limit is **~5,000 calls/day per app** — easy to blow on first sync of a 10k-SKU catalogue. Submit an Application Growth Check before production.

Listings use the **Inventory API**: `PUT /inventory_item/{sku}` defines the SKU, `POST /offer` ties it to a marketplace, `POST /offer/{offerId}/publish_by_id` lists it. Multi-warehouse is real: `inventory_item.availability.shipToLocationAvailability` references locations registered via the Inventory Location API.

**Orders:** Fulfillment API `GET /sell/fulfillment/v1/order`. States `NOT_STARTED → IN_PROGRESS → FULFILLED`. **Fulfilment writeback:** `POST /order/{orderId}/shipping_fulfillment` with tracking_number + carrier_code.

**AU gotchas:**
1. **`marketplaceId: "EBAY_AU"` must be set on the offer** — wrong value lists on .com instead of .com.au.
2. **AU-specific category IDs** that don't exist on EBAY_US (e.g. AU motors).
3. **Australian GST** — `getOrders` returns an `ebayCollectAndRemitTaxes` block for low-value imports; must be excluded from seller-payable totals.
4. **Don't mix Trading API (XML) and Inventory API (REST) on the same SKU** — they can desync. Pick one. ([docs](https://developer.ebay.com/develop/apis))

### 2.2 What competitors actually ship — channel integrations

#### Katana

| Target | Native? | Sync direction | Notable behaviour |
|---|---|---|---|
| Shopify | Yes | Both ways, real-time | Webhook-driven. Orders, refunds, cancellations, archive. Stock + fulfilment + tracking writeback. **Shopify returns are NOT synced.** |
| WooCommerce | Yes | Both ways | REST-API-key setup (not OAuth). Stock writeback. Fulfilment-writeback parity unverified. |
| Amazon FBA | Native, SP-API | Mostly inbound | Daily/weekly FBA inventory reconciliation; shipped orders pulled. Cannot list to Amazon. |
| Amazon FBM | **Routed via Extensiv** | Both, but limited | No fulfilment-status writeback, no tracking writeback, no returns (Extensiv limitations). |
| Etsy | **Routed via Extensiv or Make** | Both, but limited | Make-based flow can mark Etsy orders shipped; Extensiv route cannot. |
| eBay | **Routed via Extensiv** | Both, but limited | Orders in, stock out. **No fulfilment writeback, no tracking, no returns.** |

**Strategic read on Katana:** Their non-Shopify channels are second-class. The Extensiv-routed integrations have *hard, advertised* limitations. A native Etsy or eBay connector with two-way fulfilment writeback is visibly better on every comparison page.

#### Cin7 Core

| Target | Native? | Sync direction | Notable behaviour |
|---|---|---|---|
| Shopify | Yes | Both ways, real-time | Webhook-driven. Refunds in Core do NOT push back to Shopify (asymmetric). |
| WooCommerce | Yes | Both ways, REST keys | "Master source" toggle for product data direction. |
| Amazon | Yes | Both | **FBA + FBM + MCF in one integration** — best Amazon coverage of any competitor. Cannot list new items from Core to Amazon. |
| Etsy | Yes, native | Both | Auto-load orders; auto-renew listings when stock returns. **Etsy cancellations do not sync** — must manually void in Core. |
| eBay | Yes, native | Both | Real-time orders, payments, cancellations as credit notes, returns as credit notes. Listing creation from Core unverified. |

**Strategic read on Cin7 Core:** Their channel coverage is the bar. Amazon FBA+FBM+MCF in one integration is genuinely deep. They license each storefront separately — Standard tier allows only 2 ecommerce integrations, Pro allows 4, Advanced allows 6. **A multi-channel AU brand needs Pro ($599/mo) at minimum.**

#### MRPeasy

| Target | Native? | Sync direction | Notable behaviour |
|---|---|---|---|
| Shopify | Yes | Both | Orders in (event-driven), stock out hourly. Returns import (RMA + credit invoice). |
| WooCommerce | Yes | Both | Same pattern; returns documentation thinner than Shopify. |
| Amazon | Yes (SP-API) | Mostly inbound | Orders in. FBA inbound shipments + settlement reports not clearly documented (unverified). |
| Etsy | **No** | Zapier only | API/Zapier on Unlimited plan ($149/user/mo) required. |
| eBay | **No** | Zapier only | Same constraint. |

**Strategic read on MRPeasy:** Their channel set is narrower than Cin7. No Etsy, no eBay natively. Their Shopify/Woo coverage is solid but inventory writeback is **once per hour** (polling, not webhook) — overselling window during traffic spikes.

#### Craftybase

| Target | Native? | Sync direction | Notable behaviour |
|---|---|---|---|
| Etsy | **Yes — deep, the differentiator** | Both | Listings → recipes (BOMs); variation matrix preserved. **Per-order COGS at moving weighted-average.** Polling daily at 05:00 local (NOT webhook). |
| Shopify | Yes | Both | Orders in (hourly or daily configurable); Stock Push out (manual on Indie+, auto on Business+). No fulfilment-status writeback. |
| WooCommerce | Yes | Both | Daily polling. No fulfilment writeback. |
| Amazon | Yes | Inbound only | **No stock push to Amazon** — read-only sales channel, overselling risk if mixed. |
| eBay | **No** | — | KB explicitly says "no, on roadmap." |

**Strategic read on Craftybase:** They are the best-in-class Etsy partner — and that's basically the whole product. Outside Etsy, the integrations are shallower than Manuva needs.

### 2.3 Shipping platforms (Starshipit, Shippit, ShipStation)

All three sit in the same architectural slot: pull paid orders from sales channels or an inventory/MRP system, let the merchant pick carrier/service, generate label + manifest, push tracking back to the source system.

| Platform | Origin | AU-native carriers | Direct inventory/MRP connectors |
|---|---|---|---|
| **Starshipit** | AU/NZ | AusPost, StarTrack, Aramex, Sendle, CouriersPlease, TNT, DHL Express, FedEx, UPS, NZ Post | **Katana, Cin7 Core, Cin7 Omni, Unleashed, NetSuite, Brightpearl, Odoo** |
| **Shippit** | AU | AusPost, CouriersPlease, Aramex, Allied Express, TNT, StarTrack, DHL, FedEx | Cin7 Core, Cin7 Omni, NetSuite, Peoplevox (narrower than Starshipit) |
| **ShipStation** | US (Auctane) | Global, 200+ carriers including AusPost | Cin7 Core, Katana. MRPeasy/Unleashed via Zapier or middleware |

**Manuva's position:** Clean handoff, not competition. Once a sales order is ready to ship, Manuva would hand it to Starshipit (or equivalent), Starshipit picks the carrier and prints the label, tracking flows back into Manuva and forward to the source sales channel. Identical pattern to Starshipit's existing Katana/Cin7/Unleashed connectors. **No overlap with Manuva's manufacturing/inventory scope.**

For an AU-first product, **Starshipit is the obvious first shipping connector** — they actively partner with inventory/MRP tools (their integration page lists six MRP-class systems by name).

---

## Part 3 — Cross-channel reconciliation patterns

This is the section Manuva needs most to internalise because **the current data model is platform-coupled** and must change before a second channel ships.

### 3.1 The Manuva-specific schema problem

The current `orders` table has a `shopify_order_id` column. The current `shopify_product` and `shopify_variant` tables are platform-specific. The sync pipeline at `src/lib/shopify/sync.ts` writes directly into these tables and then reconciles allocations against finished-goods stock by joining `order_line → variant`.

This is fine for one channel. It does not survive a second one. Concretely, a second channel needs:

1. A channel-agnostic `external_order` or `sales_channel_order` concept with `channel`, `external_id`, and `external_number` columns — replacing `orders.shopify_order_id`.
2. A `sku_mapping` (or "channel listing") concept: one Manuva variant → many channel listings, each with their own external SKU/ID. **This is how every competitor models it.**
3. A unified order view that retains channel attribution for reporting.

These are foundational schema changes that should land before — or as the very first part of — the WooCommerce build, not as a refactor inside it.

### 3.2 SKU / product mapping — how competitors solve it

The universal pattern across Katana, Cin7 Core, MRPeasy, Craftybase:

- The internal system holds the **master product** (Manuva variant).
- Each connected channel has its own **listing** entity: external_id + external_SKU + listing-specific metadata (price, title, image, status).
- A `sku_mapping` table joins one master to many listings.
- **SKU is the canonical join key** — every competitor falls back to "SKU must match between systems" as the primary mapping rule, with manual override for the long tail.

Differences in execution:

- **Cin7 Core has a "master source" toggle** per channel — either Core is master (push catalogue out) or the channel is master (pull catalogue in). This is unusually flexible.
- **Craftybase** binds each variation to a "recipe" (BOM) — explicit linkage to manufacturing, which is what Manuva already does implicitly.
- **Katana** auto-imports products on first sync and never tries to push catalogue back; users maintain listings inside Shopify/Etsy/etc.
- **MRPeasy** does the most conservative thing: **products must already exist in both systems with matching SKUs**, no inline creation.

**Recommendation for Manuva:** Adopt the Cin7-style master-source toggle per channel from day one. The cost of adding it later is high (schema and UI both); the cost of building it in is one extra column and a setting screen.

### 3.3 Unified order view — how competitors solve it

The dominant pattern: a single Orders list with a Channel column, a channel-prefixed order number (e.g. `SH-1234`, `AM-5678`, `EB-9012`), and channel-aware filters. Cancellation, refund, and fulfilment events flow back through the channel-specific webhook handler but materialise into the same allocation/production-planning logic downstream.

The hard cases — uniformly weak across the field — are returns:

- **Katana does not sync Shopify returns at all.**
- **Cin7 Core syncs returns inbound but not outbound** — refunds in Core do not push to Shopify.
- **Etsy refund handling has documented edge cases** in both Cin7 Core (refunds on unfulfilled sales cause restock errors) and Craftybase (handled but only on next poll).
- **Etsy cancellations don't sync at all in Cin7 Core** — must manually void in Core.

Returns is a credible "best-in-class" area to build. The bar is genuinely low.

### 3.4 Payout reconciliation — what reconciliation means for AU sellers

When a Shopify Payments / Amazon AU / Etsy payout hits an AU bank account, it's a *net* number. Gross sales − marketplace fees − payment-processor fees − refunds − gift cards − sales tax remitted ± FX adjustments = bank deposit. Channels deposit settlements every 1–14 days depending on platform and configuration.

**Manuva should not build a payout reconciliation engine.** A2X (and Link My Books, and Synder) already do this well, have AU GST handling that's been hammered on by AU accountants, and start at US$19–$40/month — cheap enough that even a small AU brand can use one. Building this is a multi-quarter, low-margin commitment with a credible category leader entrenched.

What Manuva *should* do is publish a documented stack:

> Manuva (manufacturing-cost side) + A2X (revenue-reconciliation side) → Xero/MyOB

…and ensure the COGS journals Manuva posts don't collide with A2X's revenue journals (they won't, because A2X never touches the inventory or COGS accounts — but the documented mapping needs to be unambiguous).

---

## Part 4 — Accounting integrations

This is where the analysis is most decisive. Manuva's existing competitive doc lists "accounting integration" as the #1 critical gap — but it lumps Xero, QBO, and MyOB into one row. The reality is three substantially different products with three different opportunity profiles.

### 4.1 Xero — the foundation

**Why it's foundational:** AU/NZ/UK SMB market leader. Every credible AU manufacturing-SaaS competitor has it. Granular OAuth scopes become mandatory for new apps from **2 March 2026** — Manuva would launch under the new regime (no migration debt).

**API surface:** REST, OAuth 2.0, 60 calls/min/tenant, 5,000 calls/day/tenant. Demo Company resets every 28 days; no separate sandbox tenant. Tracking categories **hard-capped at 2 active**, each with up to 100 options.

**Inventory in Xero is shallow** — FIFO average cost only, no locations, no lots, no BOMs. This is *good news* for Manuva: nobody should keep manufacturing inventory in Xero. Manuva remains system of record; Xero receives GL effects.

**The Manuva-relevant endpoints:**
- `POST /Invoices` with `Type=ACCREC` (sales) or `ACCPAY` (bills). Goods receipt → bill. Channel order → invoice.
- `POST /ManualJournals` — the canonical endpoint for raw GL postings. **This is where Manuva's manufacturing-cost story lives.**
- `POST /Items` — basic price/cost templates if needed for line-item mapping.
- `GET /TaxRates` — must look up codes; user-owned strings, can't hard-code `OUTPUT`/`INPUT`.

**Where the competitors land:**

| Competitor | Sales invoice (AR) | Bill (AP) | COGS/manufacturing journal | Per-channel consolidation |
|---|---|---|---|---|
| **Katana** | One-click in UI | One-click (creates Bill, NOT PO) | **Manual** — user reads COGS amount from Katana, enters journal themselves | No |
| **Cin7 Core** | Auto, configurable per channel (Individual / Daily / Monthly / No sync) | Always auto | Auto COGS journal, daily consolidation | **Yes — per channel** |
| **MRPeasy** | Auto ~5 min push | Auto on PO billing | **Daily Manual Journal** summarising WIP/FG/COGS | No (single journal) |
| **Craftybase** | None (Craftybase is COGS-only on accounting side) | None | n/a (no Xero connector) | n/a |

**The opportunity:** Match Cin7 Core's per-channel consolidation *and* go deeper than MRPeasy on the journal side. Specifically:

- **Per-production-order COGS journal**, not daily aggregate. Posted when the production order closes. References the production order number, BOM version, finished SKU, and actual quantity produced. Lets a Xero user click into a COGS entry and trace it back to a specific run.
- **Variance lines on the journal**: PPV (purchase-price variance), MUV (material usage variance), LRV (labour-rate variance), scrap. These are line items that bookkeepers invent today; Manuva can post them automatically because the production data already exists.
- **Landed-cost allocation** on goods receipt: post the supplier bill *and* the allocation journal pushing freight/duty into inventory by weight or value (which Manuva already calculates).
- **WIP roll-forward**: a per-period journal moving raw → WIP → finished, with the Xero trial balance always agreeing to Manuva's stock-on-hand valuation report.

**Caveats and gotchas:**
- Two-active-tracking-categories limit — Manuva will need to pick which dimensions to push (likely Department + Production Line, or Department + Customer; one of these will need to be omitted).
- Multi-currency requires Xero Premium tiers; gracefully fail on Starter/Standard.
- Granular scopes from March 2026: request only what's needed (`accounting.transactions`, `accounting.journals.read`, `accounting.contacts`, `accounting.settings`, `accounting.attachments`).

### 4.2 QuickBooks Online — secondary, US-expansion-relevant

**Why it's secondary:** Negligible AU market share. Becomes critical only if Manuva targets US (per the AU-primary target customer answer, this is "later, not now"). All major competitors have it; missing it loses zero AU deals but limits TAM.

**API surface:** REST, OAuth 2.0, 10 req/sec/realm, 120/min on batch. Sandbox is first-class — every Intuit dev account gets sandbox companies for US/CA/UK/AU/FR/IN. 2026 metered "CorePlus" tier for read operations (figures shifting — verify against current Intuit pricing).

**Inventory:** FIFO single-warehouse, no lots/serial. "Multi-location" in QBO Plus/Advanced is a *transaction-tag location*, not multi-warehouse stock. Same story as Xero: Manuva owns inventory, QBO receives GL.

**Class and Location are two flat dimensions** (orthogonal); both gated to QBO Plus/Advanced. Effectively the same role as Xero tracking categories but with an edition gate.

**Manuva-relevant endpoints:** `POST /invoice`, `POST /bill`, `POST /journalentry` (COGS), `POST /salesreceipt`.

**Where the competitors land** — closely mirror Xero, except:

- **Katana's QBO connector is one notch better than its Xero connector** because it posts an automatic COGS journal on delivery (Xero requires manual entry). This is the *one* automatic journal Katana ships.
- **Cin7 Core's QBO connector** also pushes Core POs as QBO POs (Xero only gets Bills). Same per-channel consolidation as their Xero connector.
- **Craftybase has a QBO COGS sync at Growth tier** ($349/mo), US-only, manual trigger ("sync when your accountant asks"). Narrow but real differentiation in the maker tier.

**Strategic read:** QBO parity with Xero should be the second accounting connector, not the first. Build Xero first (deeper, more differentiation surface for AU), copy the patterns to QBO when US expansion warrants it.

### 4.3 MyOB — the AU differentiator

**The naming situation that confuses every analysis:**

- MyOB now markets a unified **"MyOB Business API"** (renamed from "AccountRight API"). Per MyOB's own developer comms: *"There is no technical change to the API. The API has been renamed to the MyOB Business API but this is a name change only."*
- But there are still **two distinct products underneath that one API**:
  - **MyOB AccountRight** — the desktop-derived product, now cloud-hosted (`.myox` files). Richer feature set: multi-currency, jobs, advanced inventory (locations, Auto-Build for kit assemblies), full payroll. **The product AU manufacturers actually use.**
  - **MyOB Business** (formerly Essentials) — the newer browser-only product, lighter, designed for micro-businesses.
- **AccountRight Classic v19 retires 28 February 2026** — file is read-only after that. Any partner still on Classic ODBC must be off it.
- For an AU manufacturer, **AccountRight is overwhelmingly the relevant product**. MyOB Business lacks the inventory/job-tracking depth manufacturers rely on.

**API surface:** Base `https://api.myob.com/accountright/` (the path remains "accountright" despite the renamed product — unverified for newest customers, verify against the live endpoint reference). OAuth 2.0 to `secure.myob.com` + an additional `x-myobapi-cftoken` header for the company-file user/password (a legacy quirk most OAuth tutorials miss). `x-myobapi-version: v2` required. **8 req/sec per API key, 1M req/day per API key.** Max 2 active API keys per developer account. **No hosted sandbox with seeded data** — onboarding partners is harder than Xero/QBO.

**Manuva-relevant endpoints:**
- `POST /Purchase/Bill/Item` — goods receipt → bill. Item.UID must already exist; no inline item creation.
- `POST /Sale/Invoice/Item` — channel order → invoice. Contact must exist first.
- `POST /GeneralLedger/GeneralJournal` — COGS journal.
- `POST /Inventory/Adjustment` — closer to a real manufacturing posting than a raw journal: "I built finished goods from raw materials." AccountRight-only.
- `GET /GeneralLedger/TaxCode` — every line item requires a TaxCode UID, must be pre-resolved.
- `GET /GeneralLedger/Job` — single-level tracking dimension (the "Job"). Second axis is "Category" (`/GeneralLedger/Category` + `/CategoryRegister`).

**Where the competitors land:**

| Competitor | MyOB support |
|---|---|
| Katana | **None.** Marketplace absence; reach MyOB only via open API or Make. |
| Cin7 Core | **None native.** Third-party SAAS Integrator bridges Cin7 ↔ MyOB Acumatica (the ERP product, not AccountRight). Effectively no SMB MyOB option. |
| MRPeasy | **None.** Zapier-only on Unlimited plan, and even Zapier's MyOB depth is partial. |
| Craftybase | **None.** |
| Qoblex | **None native** (Xero + QBO only). |
| inFlow | **None.** |
| Unleashed | **Yes** (limited per existing competitive matrix). |
| Fishbowl | Limited. |

**The opportunity is unambiguous.** The only credible MyOB-native competitor in the manufacturing-SaaS space is Unleashed. Katana lacks MyOB and is repeatedly called out for it in AU comparison reviews. For Manuva AU-first, building MyOB AccountRight integration *to the same depth as Xero* (bills, invoices, COGS journals with variances, landed-cost allocation, Inventory Adjustment for build events) creates a defensible sales narrative against every direct competitor.

**Caveats:**
- The `cftoken` header is unique; non-trivial to integrate-test without a real file.
- No sandbox with seeded data — partner onboarding is meaningfully more work than Xero.
- Multi-currency is AccountRight-only and a paid add-on; gracefully degrade.
- Two-API-keys-per-dev-account ceiling means careful staging.
- AccountRight Classic retires Feb 2026 — start fresh, never support Classic ODBC.

### 4.4 The third-party connector layer (A2X / Link My Books / Synder)

What they uniquely solve: **settlement-period summary posting** that reconciles marketplace payouts to bank deposits. They wait until a Shopify/Amazon/Etsy payout closes, then post **one summary entry per payout** broken out by sales (split by tax rate), refunds, shipping, marketplace fees, payment-processor fees, sales tax collected, etc.

**A2X** is the category leader. Channels: Amazon (incl. AU), Shopify, eBay, Etsy, Walmart, BigCommerce, TikTok Shop. Accounting: Xero, QBO, Sage, NetSuite. **Strong AU GST handling**: dedicated AU/NZ chart of accounts, tax-rate mapping per line type, correct booking of Amazon-collected GST as a liability rather than sales. Single-channel from US$19/mo (≤200 orders).

**Link My Books**: same category, narrower accounting targets (Xero + QBO only), unlimited channels at every paid tier. ~US$17/mo entry.

**Synder**: broader scope, supports both A2X-style summary and per-transaction sync, covers payment processors directly (Stripe, PayPal, Square). More appropriate for businesses wanting fine-grained per-customer GL data. ~US$40/mo entry.

**Manuva's strategic position:** Don't build this. Document the partnership stack publicly: *Manuva (cost side) + A2X (revenue side) → Xero/MyOB*. The journals don't collide because A2X never touches inventory or COGS accounts.

**Why Manuva wins on the cost side that A2X cannot touch:**

A2X has no concept of: BOM; real cost vs standard cost variance; work-in-progress; production yield and scrap; labour absorption; landed cost; multi-location inventory; purchase-price variance. **The whole upstream half of the manufacturing GL is invisible to A2X.** None of the three accounting platforms have shown any sign of building MRP-level features in 15+ years. The moat is durable.

---

## Part 5 — Gaps in the market

Distinct from the "where Manuva is missing parity" gap analysis in the existing competitive doc. These are the *cross-competitor* gaps — where everyone is weak, and Manuva could be best-in-class.

### Gap 1 — MyOB AccountRight native integration

Already covered (Part 4.3). The single clearest unoccupied territory. **Estimated impact: deal-deciding for ~30–40% of AU SMB manufacturers** (rough estimate based on AU SMB accounting-software market share — verify with internal data).

### Gap 2 — Xero with per-production-order COGS journals + variance lines

MRPeasy gets closest (daily aggregate). Cin7 Core does per-channel consolidation on the revenue side but their COGS journal is daily-aggregate too. **No competitor posts a per-production-order COGS journal with PPV/MUV/LRV/scrap variance lines.** This is exactly the data Manuva has from its existing BOM + yield + labour features.

### Gap 3 — Native Etsy + eBay + Xero in one tool

The AU SMB sweet spot. Today:
- Craftybase: Etsy yes, eBay no, Xero no.
- MRPeasy: Etsy via Zapier, eBay via Zapier, Xero yes.
- Cin7 Core: Etsy yes, eBay yes, Xero yes — but $349–$599/mo and 2–4 storefront license cap.
- Qoblex / inFlow: incomplete coverage, no MyOB.

**No tool in the $99–$249 segment covers all three.** Manuva's $249 Growth tier could be the first.

### Gap 4 — Best-in-class returns handling

Uniformly weak everywhere:
- Katana doesn't sync Shopify returns at all.
- Cin7 Core syncs returns inbound but not outbound.
- Etsy refund/cancellation handling has documented edge cases in both Cin7 and Craftybase.

Genuine room for a "returns done right" story. Lower priority than Gaps 1–3 but credible.

### Gap 5 — Native first-party Etsy + eBay with full fulfilment writeback

Katana's Extensiv-routed Etsy and eBay integrations have hard, advertised limitations: no fulfilment-status writeback, no tracking writeback, no returns. **A native connector with two-way fulfilment writeback is visibly better on every comparison page** for the same engineering cost as building any other channel.

### Gap 6 — Documented "manufacturing + revenue-reconciliation stack" with A2X

No competitor publicly partners with A2X. The stack is obvious in hindsight (cost side + revenue side) but no manufacturing-SaaS markets it. Low engineering cost, high marketing leverage.

---

## Part 6 — Recommendations

### 6.1 Sequencing (the "what to build, in what order")

Pre-work — must precede multi-channel:

**0. Schema decoupling.** Rename/restructure `orders.shopify_order_id` to a channel-agnostic `external_order` model. Add `sales_channel`, `external_id`, `external_number` columns. Add a `sku_mapping` (or "channel listing") concept: one Manuva variant → many channel listings. **This is the single highest-leverage build before any second channel.** Estimated as its own spec.

Wave 1 — close the AU-veto risk:

**1. Xero — go deeper than Katana, match Cin7 Core, exceed MRPeasy.** Bills, invoices, per-production-order COGS journals with variance lines (PPV/MUV/LRV/scrap), landed-cost allocation, WIP roll-forward, two-active-tracking-category mapping. Granular scopes from day one.

**2. MyOB AccountRight (and MyOB Business).** Same depth as Xero. AU differentiation play. Plan for the `cftoken` quirk and the no-sandbox onboarding model. Skip AccountRight Classic.

Wave 2 — close the multi-channel gap:

**3. WooCommerce.** Easiest second channel: REST + webhooks, OAuth-ish (per-store keys), full PII, no gatekeeper approval. Use this to harden the new channel-agnostic schema in production.

**4. Amazon SP-API (Amazon AU first).** Bigger build: OAuth via Login-with-Amazon, RDT for PII, Notifications API via SQS, FBA inventory reconciliation, FBM fulfilment writeback. Marketplace app approval is a real schedule item.

**5. eBay (EBAY_AU) and Etsy.** Both native, with full fulfilment-status writeback and tracking writeback — explicitly beating Katana's Extensiv-routed limitations. Etsy's 10 QPS app-wide ceiling needs careful budgeting for multi-tenant.

Wave 3 — coverage and US-readiness:

**6. QuickBooks Online.** Parity with Xero. Lower priority for AU but unlocks US expansion.

**7. Starshipit (handoff).** Shippable-order webhook out, tracking-number callback in. Pattern is well-established (Katana/Cin7/Unleashed all have it).

**Out of scope for the foreseeable future:**
- Payout reconciliation (use A2X — document the stack).
- Cross-channel inventory deduction with FBA (explicitly excluded from this analysis).
- Shopify multi-store (already a Pro+ feature; not the bottleneck).
- B2B / wholesale portal (different buyer motion, separate analysis).

### 6.2 Cross-cutting principles

- **OAuth where available; API-key paste only for WooCommerce.** Every competitor lands here.
- **Webhook where supported, polling where forced.** Webhook for Shopify, WooCommerce, eBay, MyOB-and-Xero-events. Polling for Etsy (no webhooks) and Amazon orders (Notifications API is push-via-SQS but not strictly webhook).
- **Channel-aware rate-limit budget tracking** is an internal infrastructure piece — Etsy's 10 QPS / 10k QPD app-wide cap especially. Build before the second channel.
- **Multi-tenancy implications for every external connection** — per-tenant token storage, per-tenant rate-limit accounting, per-tenant webhook signing secrets.
- **Returns are uniformly weak across competitors** — credible "best-in-class" play, but don't let it block Wave 1.
- **Document the A2X partnership stack publicly.** Marketing leverage with no engineering cost.

### 6.3 What this analysis does NOT decide

- The schema spec for the channel-agnostic data model (Wave 0).
- The specific implementation choices for each integration.
- Which integration to spec *first* after this analysis (Wave 1 has two — Xero or MyOB).
- Pricing / tier-gating decisions for the new integrations.

Each of those is a separate spec → plan → implementation cycle. The user explicitly chose strategic analysis over implementation planning for this brainstorm.

---

## Appendix A — Sources

**Channel APIs:**
- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [Amazon SP-API overview](https://developer-docs.amazon.com/sp-api/), [Marketplace IDs (AU = A39IBJ37TRP1C6)](https://developer-docs.amazon.com/sp-api/docs/marketplace-ids), [Endpoints](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints)
- [Etsy Open API v3](https://developers.etsy.com/documentation/), [Auth (OAuth + PKCE)](https://developer.etsy.com/documentation/essentials/authentication/), [Rate limits](https://developer.etsy.com/documentation/essentials/rate-limits/)
- [eBay Sell APIs index](https://developer.ebay.com/develop/apis), [Inventory API](https://developer.ebay.com/api-docs/sell/inventory/overview.html), [Fulfillment API](https://developer.ebay.com/api-docs/sell/fulfillment/overview.html)

**Accounting platform APIs:**
- [Xero Accounting API](https://developer.xero.com/documentation/api/accounting/overview), [Manual Journals](https://developer.xero.com/documentation/api/accounting/manualjournals), [Tracking Categories](https://developer.xero.com/documentation/api/accounting/trackingcategories), [Scopes (granular from 2026-03-02)](https://developer.xero.com/documentation/guides/oauth2/scopes/)
- [QuickBooks Online Developer Docs](https://developer.intuit.com/app/developer/qbo/docs/develop), [Rate limits](https://developer.intuit.com/app/developer/qbo/docs/develop/rest-api/throttle-limits)
- [MyOB Business API overview](https://developer.myob.com/api/myob-business-api/api-overview/), [Getting started](https://developer.myob.com/api/myob-business-api/api-overview/getting-started/), [Product/API matrix](https://apisupport.myob.com/hc/en-us/articles/4824719330959-MYOB-Product-API-Matrix), [Introducing the MyOB Business API rename](https://apisupport.myob.com/hc/en-us/articles/4407275101967-Introducing-the-MYOB-Business-API)

**Payout connectors:**
- [A2X](https://www.a2xaccounting.com/), [A2X pricing](https://www.a2xaccounting.com/pricing), [A2X AU GST setup](https://support.a2xaccounting.com/en/articles/3401545-a2x-for-shopify-and-australian-gst)
- [Link My Books](https://linkmybooks.com/), [features](https://linkmybooks.com/features), [pricing](https://linkmybooks.com/pricing)
- [Synder](https://synder.com/), [Summary vs Per-Transaction](https://synder.com/blog/daily-summary-vs-per-transaction-sync/)

**Competitor integration docs:**
- Katana: [Integrations directory](https://katanamrp.com/integrations/), [Shopify](https://support.katanamrp.com/en/articles/5968286-shopify-integration-overview), [WooCommerce](https://support.katanamrp.com/en/articles/5968239-woocommerce-integration-overview), [Amazon FBA via Extensiv](https://support.katanamrp.com/en/articles/6167678-amazon-seller-central-fulfilled-by-amazon-integration-via-extensiv), [eBay via Extensiv](https://support.katanamrp.com/en/articles/6290848-ebay-integration-via-extensiv), [Etsy via Extensiv](https://support.katanamrp.com/en/articles/10308892-etsy-integration-via-extensiv), [Xero FAQ](https://support.katanamrp.com/en/articles/5968135-xero-faq), [QBO overview](https://support.katanamrp.com/en/articles/5968184-quickbooks-online-integration-basic-overview)
- Cin7 Core: [Shopify](https://help.core.cin7.com/hc/en-us/articles/9034589848335-Introduction-to-Shopify), [Amazon](https://help.core.cin7.com/hc/en-us/articles/9034459874703-Amazon-integration), [Etsy](https://help.core.cin7.com/hc/en-us/articles/9034498104207-Etsy-Integration), [eBay](https://help.core.cin7.com/hc/en-us/articles/9034465028751-eBay-Integration), [Xero](https://help.core.cin7.com/hc/en-us/articles/9034616938511-Introduction-to-Xero), [Xero sync options](https://help.core.cin7.com/hc/en-us/articles/13000978343695-Xero-sync-options), [QBO](https://help.core.cin7.com/hc/en-us/articles/9034527490063-QuickBooks-Online-integration)
- MRPeasy: [Integration index](https://www.mrpeasy.com/resources/user-manual/integration/), [Shopify](https://www.mrpeasy.com/resources/user-manual/settings/system/integration/shopify/), [Xero](https://www.mrpeasy.com/resources/user-manual/settings/system/integration/xero/), [QuickBooks](https://www.mrpeasy.com/resources/user-manual/settings/system/integration/quickbooks/)
- Craftybase: [Integrations](https://craftybase.com/integrations/), [Etsy](https://help.craftybase.com/article/272-connect-etsy-to-craftybase), [Shopify](https://help.craftybase.com/article/311-connect-shopify-with-craftybase), [QuickBooks COGS sync](https://craftybase.com/blog/quickbooks-cogs-inventory-valuation-sync), [eBay (not supported)](https://help.craftybase.com/article/645-does-craftybase-integrate-with-ebay)

**Shipping platforms:**
- [Starshipit integrations](https://starshipit.com/integrations)
- [Shippit integrations](https://www.shippit.com/integrations)
- [ShipStation integrations](https://www.shipstation.com/integrations/)

## Appendix B — Unverified claims to confirm before quoting publicly

Marked throughout the doc with "(unverified)". Summarised:
- MRPeasy Amazon FBA inventory reconciliation depth (specific endpoints, settlement-report ingestion).
- WooCommerce fulfilment-status writeback in Katana (parity with Shopify).
- eBay listing creation depth in Cin7 Core.
- AU GST parity across A2X / Link My Books / Synder (each vendor's marketing asserts it; depth differs and should be tested on a real AU tenant).
- QBO 2026 metered "CorePlus" pricing — announced in 2025; numbers may have shifted.
- MyOB Business API endpoint path (`/accountright/` prefix) still being current for newest customers — verify against `developer.myob.com` live reference.
- Shippit's Amazon and Magento connectors (search did not surface dedicated pages; may be partner-routed).
- ShipStation native MRPeasy/Unleashed connector (likely Zapier/middleware, not first-party).
