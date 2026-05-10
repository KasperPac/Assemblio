# Manuva Pricing Strategy & Public Pricing Page

**Date:** 2026-05-10
**Status:** Approved design — ready for implementation

---

## 1. Purpose

This document serves two functions:

1. **Internal pricing strategy** — the rationale, competitive positioning, and feature allocation decisions behind Manuva's tier structure.
2. **Public pricing page spec** — the content, layout, and feature matrix for the `/pricing` marketing page.

---

## 2. Competitive Landscape

All prices are annual billing rates. Verify current pricing before publishing.

| Competitor | Entry | Mid | Top | Notes |
|---|---|---|---|---|
| **Katana MRP** | $179/mo | $399/mo | $799/mo | Closest direct competitor. Shopify-native, manufacturing-first. |
| **Cin7 Core** | $349/mo | $499/mo | $849/mo | ERP-lite, mid-market lean. Higher price point, different buyer. |
| **inFlow Inventory** | $110/mo | $190/mo | $310/mo | Inventory-first, limited manufacturing depth. |

### Positioning

Manuva targets Shopify-native manufacturing brands. Katana is the primary benchmark — same buyer, same problem, same integration. The pricing strategy is to **undercut Katana on every tier** while matching or exceeding their core feature depth, making Manuva the obvious choice for price-sensitive Shopify brands who've already considered Katana.

Cin7 Core and inFlow are not direct competitors at the entry/growth level but anchor the upper and lower ends of the market. Manuva should never price above Katana on equivalent tiers.

---

## 3. Pricing Structure

### Model

- **Flat monthly per tier** — one price per tier, no per-seat fees, no usage meters.
- **Annual billing** is the default and primary offer. Monthly billing available at a ~20% premium.
- **No add-ons** — all features are tier-gated. Simplifies sales and support.

### Tiers

| Tier | Annual (per month) | Monthly billing | Billed annually |
|---|---|---|---|
| **Starter** | $99/mo | $119/mo | $1,188/yr |
| **Growth** | $249/mo | $299/mo | $2,988/yr |
| **Pro** | $499/mo | $599/mo | $5,988/yr |
| **Enterprise** | Custom | Custom | Annual contract |

### Scale Limits

| | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Warehouse locations | 1 | 5 | Unlimited | Unlimited |
| Team members | 3 | Unlimited | Unlimited | Unlimited |
| SKUs / components | Unlimited | Unlimited | Unlimited | Unlimited |

SKUs are unlimited on all tiers — limits are structural (locations, users) not volumetric, keeping pricing clean for growing brands.

---

## 4. Feature Matrix

### Shopify Integration

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Product + variant sync | ✓ | ✓ | ✓ | ✓ |
| Order sync + allocation | ✓ | ✓ | ✓ | ✓ |
| Webhook-driven real-time sync | ✓ | ✓ | ✓ | ✓ |
| Multiple Shopify stores | — | — | ✓ | ✓ |

### Inventory Management

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Component inventory + balances | ✓ | ✓ | ✓ | ✓ |
| Inventory movements ledger | ✓ | ✓ | ✓ | ✓ |
| Stocktake | ✓ | ✓ | ✓ | ✓ |
| Activity log | ✓ | ✓ | ✓ | ✓ |
| Low stock alerts | ✓ | ✓ | ✓ | ✓ |
| Bin / aisle locations | — | ✓ | ✓ | ✓ |

### BOM & Manufacturing

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| BOM builder (basic) | ✓ | ✓ | ✓ | ✓ |
| Production orders | ✓ | ✓ | ✓ | ✓ |
| Component allocation engine | ✓ | ✓ | ✓ | ✓ |
| Yield % per BOM line | — | ✓ | ✓ | ✓ |
| BOM versioning + draft/publish | — | ✓ | ✓ | ✓ |
| BOM version comparison | — | ✓ | ✓ | ✓ |
| BOM templates | — | ✓ | ✓ | ✓ |

**Starter BOM definition:** Single-level BOM with fixed quantities and a single component picker. No yield, no versioning, no templates. Sufficient for simple products with stable recipes.

### Purchasing

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Purchase orders | ✓ | ✓ | ✓ | ✓ |
| Supplier management | ✓ | ✓ | ✓ | ✓ |
| Goods inwards / receiving | ✓ | ✓ | ✓ | ✓ |

### Costing & Finance

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Cost per unit (BOM rollup) | — | ✓ | ✓ | ✓ |
| Margin tracking per product | — | ✓ | ✓ | ✓ |
| Inventory valuation | — | ✓ | ✓ | ✓ |
| Financial profitability dashboard | — | — | ✓ | ✓ |

### Reports

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Dashboard overview | ✓ | ✓ | ✓ | ✓ |
| Inventory reports (stock on hand, movements) | — | ✓ | ✓ | ✓ |
| Purchasing reports (PO summary, spend by supplier) | — | ✓ | ✓ | ✓ |
| Date range filtering on all reports | — | ✓ | ✓ | ✓ |
| PDF + CSV export | — | — | ✓ | ✓ |

### Capacity & Staffing

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Departments + staffing levels | — | — | ✓ | ✓ |
| Capacity planning | — | — | ✓ | ✓ |
| Actual vs planned time tracking | — | — | ✓ | ✓ |

### Platform & Support

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| API access | — | — | ✓ | ✓ |
| Email support | ✓ | ✓ | ✓ | ✓ |
| Priority support (< 4hr response) | — | — | ✓ | ✓ |
| Dedicated account manager | — | — | — | ✓ |
| Custom onboarding + training | — | — | — | ✓ |
| SSO / advanced security | — | — | — | ✓ |
| SLA + uptime guarantee | — | — | — | ✓ |
| Custom integrations | — | — | — | ✓ |

---

## 5. Tier Rationale

### Starter — $99/mo
**Target:** 1–10 person Shopify brand, single warehouse, simple product recipes.
**Upgrade trigger:** Outgrows 3-user limit, needs a second location, or wants costing/reports.
Core manufacturing is included from day one — Starter is not an inventory-only tool. This matches Katana Essential's value proposition but at $80/mo less.

### Growth — $249/mo
**Target:** 10–50 person brand, multiple warehouse locations or storage areas, needs yield and cost visibility.
**Upgrade trigger:** Needs capacity planning, financial profitability reporting, API, or multiple Shopify stores.
Unlimited users from Growth up eliminates per-seat friction for growing teams. The jump from $99 to $249 is justified by the addition of multi-location, costing, and the full reports suite — each of which has clear ROI for a scaling brand.

### Pro — $499/mo
**Target:** Professional manufacturers with capacity planning needs, finance team involvement, or integration requirements.
**Upgrade trigger:** Enterprise sales motion — size, compliance, or bespoke requirements.
Pro is the ceiling of self-serve. API access, PDF/CSV export, and the financial profitability dashboard make this tier compelling for businesses with reporting obligations or external integrations.

### Enterprise — Custom
**Target:** Operations above Pro scale, or businesses with compliance, SSO, or SLA requirements.
**Sales motion:** Contact sales — annual contract, custom onboarding, dedicated account manager.
No feature parity gaps vs Pro except platform-level concerns (SSO, SLA, custom integrations, support tier).

---

## 6. Annual vs Monthly Billing

- **Annual** is the primary call to action on the pricing page (toggle defaults to annual).
- **Monthly** is available but priced ~20% higher to incentivise annual commitment.
- Annual pricing is shown per-month on the pricing page with "billed annually" note.
- All free trials run on a 14-day window, no credit card required.

---

## 7. Public Pricing Page Spec

### Layout

1. **Headline + subhead** — value proposition, not a feature list.
2. **Annual/monthly toggle** — defaults to annual, shows savings badge ("Save ~20%").
3. **Tier cards (4 columns)** — Starter · Growth (Most Popular) · Pro · Enterprise.
4. **Feature matrix** — full comparison table below the cards, grouped by module.
5. **FAQ** — common objections: what counts as a location, what's in the free trial, can I change tiers.

### Tier card anatomy

Each card contains:
- Tier name + one-line target customer description
- Price (large) with `/mo` label + billing note
- CTA button (primary on Growth, outline on others, dark on Enterprise)
- Scale limit chips (locations, users)
- Top 5–7 features for that tier (not a full list — that's the matrix)
- "Everything in [previous tier]" line for Growth+

### CTA labels
- Starter / Growth / Pro: "Start free trial"
- Enterprise: "Contact sales"

### Free trial terms
- 14 days, no credit card required.
- Trial gives full Pro-level access so customers experience the full product.
- Downgrades to selected tier at end of trial if no card added.

### Tier naming
Current names: **Starter / Growth / Pro / Enterprise**
These are clear, universal, and match industry convention. Alternatives considered: Maker/Studio/Pro (more personality) and Launch/Build/Scale (action-oriented). Starter/Growth/Pro is recommended for its clarity and ease of international comprehension.

---

## 8. Decisions

- **Free trial access level:** Full Pro access for all trials. 14 days, no credit card required. Downgrades to the tier the customer selected at sign-up when the trial ends.
- **Billing:** Managed directly (not via Shopify App Store billing API). Use Stripe or equivalent — Manuva controls subscription lifecycle, invoicing, and plan enforcement.
- **Tier names:** Starter / Growth / Pro / Enterprise — confirmed.

- **Grandfathering policy:** When prices increase, existing customers keep their current rate for 3 months from the date of the price change announcement, with notice given at least 30 days in advance.
