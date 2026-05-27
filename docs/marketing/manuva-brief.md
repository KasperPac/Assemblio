# Manuva — Marketing Brief

> **Purpose:** Single-source brief on what Manuva is, who it's for, and where it wins — written to be handed to a market-research or paid-acquisition agent without further context.
> **Date:** 2026-05-13
> **Source docs:** `docs/_audit/01_vision.md`, `docs/_audit/AUDIT_REPORT.md`, `docs/_audit/MVP_PLAN.md`, `docs/superpowers/specs/2026-05-11-competitive-analysis.md`, `docs/superpowers/specs/2026-05-10-pricing-page-handover.md`, `docs/research/saas-market-gaps/report.md`, `manuva.app` marketing site.

---

## 1. One-liner

Manuva is **manufacturing-operations software for Shopify-native product brands** — inventory, BOMs, production orders, purchasing, and capacity planning in a single connected system. It replaces the spreadsheets and bolted-together MRPs those brands typically end up running.

**Live headline (manuva.app):** *"Manufacturing operations, finally simple. Manuva replaces the spreadsheets and legacy MRP your team is fighting with."*

**Supporting positioning lines already in use:**
- "Inventory, BOMs, work orders, and stock control — connected, live, and built for the floor."
- "Built for the floor, not for the demo."
- "One system covering the whole shop floor — from raw materials in to finished goods out."
- "No modules to bolt on, no consultants to hire."

**Domains:**
- Marketing: `https://manuva.app`
- App: `https://app.manuva.app` (Vercel project name internally: `assemblio`)

---

## 2. What it does today (shipped)

Core operational stack, live in the app:

- **Shopify integration** — OAuth install, real-time webhook sync of products, variants, orders, locations. Read-only on Shopify side; Supabase is the source of truth for inventory.
- **Inventory** — components, balances per location, append-only movement ledger, manual adjustments, low-stock alerts, bin/aisle locations.
- **BOMs** — multi-level/nested, versioned, yield % per line, BOM templates, one-active-per-variant enforcement.
- **Allocation engine** — Shopify orders auto-reserve components per BOM; cancellations release; fulfillments consume.
- **Stocktake** — sessions, variance, atomic apply.
- **Purchasing** — POs, suppliers, lead times, partial and bulk goods-inwards / receiving.
- **Reports** — stock-on-hand, inventory valuation, PO variance, lead-time accuracy, dead stock, inventory integrity, dashboard.
- **Multi-tenant** — Supabase auth, RLS, role-based admin / super-admin.
- **Activity log + integrity audit** — built-in self-checks (reconciliation drift, over-reservation, over-receipt, duplicates).

## 3. What it will do (roadmap, ~12 weeks out from 2026-05-13)

- **Financial / profitability dashboard** (Pro tier) — cost rollup, margin per product, COGS.
- **Capacity & staffing** (Pro tier) — departments, staffing levels, capacity planning, planned-vs-actual time, staff costing. **No direct competitor offers this combination at this price.**
- **Xero integration** — accounting sync. Strategically the most important upcoming feature; absence is currently the most-cited deal-blocker.
- **Lot / batch tracking** — required for food, cosmetics, supplements, regulated goods.
- **Shopify custom-app pipeline** — install/status feedback, 14-day full-Pro trial, invitation flow.

Explicit non-goals (won't be in market for the next 6 months): WooCommerce / Amazon connectors, mobile app, barcode scanner workflows, B2B wholesale portal, CRM.

---

## 4. Pricing (the positioning anchor)

Flat per-account, **no per-seat fees** — distinctive in this segment.

| Tier | Annual | Monthly | Limits | Buyer |
|---|---|---|---|---|
| Starter | $99/mo | $119/mo | 1 location · 3 users | Shops moving off spreadsheets |
| **Growth ⭐** | **$249/mo** | $299/mo | 5 locations · unlimited users | Mid-size manufacturers, multi-step production |
| Pro | $499/mo | $599/mo | unlimited / unlimited · API | Professional manufacturers needing capacity planning |
| Enterprise | Custom | — | SSO, SLA | Larger operations |

**14-day full-Pro trial, no credit card required.** Strongest trial in the segment.

---

## 5. Ideal customer profile (for ad targeting)

### Primary ICP — Growth tier ($249), the sweet spot
- Shopify-native consumer-product brand
- **5–50 employees**, **~$500K–$5M annual revenue**
- Manufactures or assembles its own products (not a pure reseller)
- Has outgrown spreadsheets; currently fighting with Katana / Cin7 / a legacy MRP — or actively evaluating one
- Single Shopify store, single or few warehouse locations
- Typical title: founder, COO, head of ops, production manager

### Secondary — Starter tier ($99)
Solo / very small makers, 1–5 people, **under $500K revenue**, often on Craftybase or still in spreadsheets.

### Tertiary — Pro tier ($499)
Professional manufacturers wanting capacity, costing, staffing under one roof. The MRPeasy shopper who balks at per-seat pricing for a 10+ person team.

### Geography
**Australia first.** Secondary: US, UK, NZ, Canada (English-speaking SMB manufacturing). `manuva.app` and product polish are positioned for AU SMB.

### High-fit verticals (Manuva data model maps cleanly)
- **Cosmetics, skincare, candles, soap, fragrance** — indie/"Made in Australia" Shopify brands
- **Supplements, vitamins, health foods, beverages** — regulated, batch-record-driven (waiting on lot tracking + Xero)
- **Apparel & accessories** with cut-and-sew, print, or embroidery
- **Hardware / homewares / small-batch consumer goods**
- **Coffee roasters, packaged foods, condiments, sauces**
- **Contract food manufacturers / co-packers** — flagged in `docs/research/saas-market-gaps/report.md` as A-tier adjacent opportunity, ~70–80% data model reuse

---

## 6. Competitive positioning

Use these as the basis for paid-search conquest, comparison pages, and ad copy.

| Competitor | Their gap Manuva exploits | Winning Manuva tier |
|---|---|---|
| **Katana MRP** ($179 base + $199 mfg + $249 traceability = $807/mo real cost) | Per-seat. No BOM versioning. No yield %. No capacity planning. No financial profitability dashboard. | Growth $249, unlimited users |
| **Craftybase** ($20–$49/mo) | No POs. No receiving. No team features. Falls over the moment you hire a warehouse person. | Starter $99 |
| **MRPeasy** ($49/user/mo) | A 10-person team = $490+ before extras. Not Shopify-native. Dated UI. | Pro $499 flat |
| **Cin7 Core** ($349/mo minimum) | Overbuilt for Shopify-first brands, slow guided onboarding, not manufacturing-first. | Growth $249 / Pro $499 |
| **inFlow Inventory** ($110–$1,319/mo) | BOM is paid add-on $39–$299/mo. Inventory-first, not manufacturing-first. | Growth $249 |
| **Qoblex** ($79–$179/mo) | Thin manufacturing depth, no capacity planning, no costing. | Growth $249 |
| **Fishbowl** ($4,395–$6,595 one-time) | Legacy, on-premise, no Shopify-native motion. | Pro $499 / Enterprise |

**Strongest single message:** *Comparable manufacturing depth to Katana, plus capacity planning, BOM versioning, and yield %, for less than a third of Katana's real cost with add-ons — and your whole team can use it without a per-seat bill.*

---

## 7. Buying triggers (intent signals for ads / keywords)

- Outgrowing spreadsheets / "Excel + WhatsApp" stage
- Just hired their first warehouse or ops person
- Just launched a second Shopify product line
- Stock-out, over-promise, or quote error caused customer pain
- Evaluating Katana and choking on the add-on stack
- Their bookkeeper wants Xero-compatible inventory *(coming)*
- Compliance or retailer wants lot/batch records *(coming)*
- Annual planning / FY rollover moment (typical AU FY change: 1 July)

## 8. Known objections (don't waste ad spend until closed or qualified out)

- **No Xero / QuickBooks sync today.** #1 finance-stakeholder veto. *On roadmap.*
- **No lot / batch tracking today.** Blocks regulated-goods buyers. *On roadmap.*
- **Shopify-only.** WooCommerce / Amazon-first brands are out of market — explicitly de-prioritise.
- **No mobile / barcode scanner app.** Acceptable for the current ICP, but will surface in larger-team conversations.

---

## 9. Where Manuva is uniquely strong (lean into these in creative)

These are real, verified-against-competitors differentiators — not marketing fluff:

1. **Capacity planning + departments + staffing + actual-time + staff costing in one product at $499 flat.** No direct competitor has this combination at this price. The natural anchor for the "Manuva Pro vs MRPeasy" story.
2. **BOM versioning + yield % per line + BOM templates** at $249. Katana has none of these at any price.
3. **Operational reports** — PO variance, lead-time accuracy, dead stock, inventory integrity. Buyers won't find these in Katana, Qoblex, or Craftybase.
4. **Unlimited users from Growth tier upward.** Katana, MRPeasy, Cin7 all charge per seat. For a 10-person team, Manuva Growth ($249) beats Katana ($359 + $199 add-on, per seat) on raw cost alone.
5. **14-day full-Pro trial, no credit card.** Strongest trial offer in the segment.

---

## 10. Companion document

See `docs/marketing/ad-targeting-plan.md` for a concrete first-90-days paid acquisition plan, sample creative, and channel-specific targeting parameters.
