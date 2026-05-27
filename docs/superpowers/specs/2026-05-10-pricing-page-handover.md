# Manuva Pricing Page — Handover Document

**Date:** 2026-05-10  
**Purpose:** Content and design spec for rebuilding this page on an external marketing site.

---

## Page goal

A public marketing page at `/pricing`. Converts visitors by showing transparent pricing, a full feature comparison, and answering common objections. No auth required.

---

## Page structure (top to bottom)

1. **Header** — logo + sign-in link
2. **Hero** — headline, subhead, eyebrow label
3. **Billing toggle** — annual/monthly switcher, defaults to annual
4. **Tier cards** — 4 columns: Starter · Growth (Most Popular) · Pro · Enterprise
5. **Feature matrix** — full comparison table grouped by 9 modules
6. **FAQ** — 5 questions
7. **Footer** — copyright + privacy/terms links

---

## Header

| Element | Content |
|---|---|
| Logo text | `Manuva` — links to `/` |
| Sign in link | `Sign in` — links to `/login` |

---

## Hero copy

| Element | Content |
|---|---|
| Eyebrow | `Pricing` |
| H1 | `Simple pricing for manufacturing teams` |
| Subhead | `One price per tier. No per-seat fees. No usage meters. Start free for 14 days — no credit card required.` |

---

## Billing toggle

- Two states: **Annual** and **Monthly**
- **Defaults to Annual**
- When Annual is active: show green badge `Save ~20%`
- Toggle updates all prices on the page dynamically

---

## Tier cards

Four cards displayed in a row. Growth is "Most Popular" (highlighted).

### Starter

| Field | Value |
|---|---|
| Name | Starter |
| Tagline | Small brands getting started with manufacturing ops |
| Annual price | $99/mo · billed $1,188/yr |
| Monthly price | $119/mo · billed monthly |
| CTA | Start free trial → `/login` |
| CTA style | Outline button |
| Limits | 1 location · 3 users |
| Card highlight | None |

**Feature bullets:**
- Inventory management
- Basic BOM builder
- Production orders
- Purchase orders + suppliers
- Stocktake
- Email support

---

### Growth ⭐ Most Popular

| Field | Value |
|---|---|
| Name | Growth |
| Tagline | Scaling brands with multi-location and deeper workflows |
| Annual price | $249/mo · billed $2,988/yr |
| Monthly price | $299/mo · billed monthly |
| CTA | Start free trial → `/login` |
| CTA style | Primary (filled brand colour) |
| Limits | 5 locations · Unlimited users |
| Card highlight | Brand-colour border + "Most Popular" badge |

**Feature bullets:**
- Everything in Starter
- Multi-location + bin management
- Advanced BOM (yield %, versions)
- Costing module
- Reports suite

---

### Pro

| Field | Value |
|---|---|
| Name | Pro |
| Tagline | Professional manufacturers needing capacity, costing & API |
| Annual price | $499/mo · billed $5,988/yr |
| Monthly price | $599/mo · billed monthly |
| CTA | Start free trial → `/login` |
| CTA style | Outline button |
| Limits | Unlimited locations · Unlimited users |
| Card highlight | None |

**Feature bullets:**
- Everything in Growth
- Capacity planning + staffing
- Financial profitability
- Advanced reports + PDF/CSV export
- API access
- Priority support (< 4hr)

---

### Enterprise

| Field | Value |
|---|---|
| Name | Enterprise |
| Tagline | Large operations, custom requirements, dedicated support |
| Price display | `Custom` (static — billing toggle has no effect) |
| Billing note | Annual contract · custom onboarding |
| CTA | Contact sales → `/contact` |
| CTA style | Dark/filled button |
| Limits | Unlimited locations · Unlimited users |
| Card highlight | Subtle tinted background |

**Feature bullets:**
- Everything in Pro
- Dedicated account manager
- Custom onboarding + training
- SSO / advanced security
- SLA + uptime guarantee

---

## Feature matrix

Full comparison table below the cards. Grouped into 9 modules. Column headers: Feature · Starter · Growth · Pro · Enterprise.

**Cell rendering:**
- `✓` = included (green checkmark)
- `—` = not included (muted dash)
- Text = included with qualifier (e.g. "Basic", "Unlimited")

### Module 1: Plan Limits

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Warehouse locations | 1 | 5 | Unlimited | Unlimited |
| Team members | 3 | Unlimited | Unlimited | Unlimited |
| SKUs / components | Unlimited | Unlimited | Unlimited | Unlimited |

### Module 2: Shopify Integration

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Product + variant sync | ✓ | ✓ | ✓ | ✓ |
| Order sync + allocation | ✓ | ✓ | ✓ | ✓ |
| Webhook-driven real-time sync | ✓ | ✓ | ✓ | ✓ |
| Multiple Shopify stores | — | — | ✓ | ✓ |

### Module 3: Inventory Management

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Component inventory + balances | ✓ | ✓ | ✓ | ✓ |
| Inventory movements ledger | ✓ | ✓ | ✓ | ✓ |
| Stocktake | ✓ | ✓ | ✓ | ✓ |
| Activity log | ✓ | ✓ | ✓ | ✓ |
| Low stock alerts | ✓ | ✓ | ✓ | ✓ |
| Bin / aisle locations | — | ✓ | ✓ | ✓ |

### Module 4: BOM & Manufacturing

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| BOM builder | Basic | ✓ | ✓ | ✓ |
| Production orders | ✓ | ✓ | ✓ | ✓ |
| Component allocation engine | ✓ | ✓ | ✓ | ✓ |
| Yield % per BOM line | — | ✓ | ✓ | ✓ |
| BOM versioning + draft/publish | — | ✓ | ✓ | ✓ |
| BOM version comparison | — | ✓ | ✓ | ✓ |
| BOM templates | — | ✓ | ✓ | ✓ |

### Module 5: Purchasing

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Purchase orders | ✓ | ✓ | ✓ | ✓ |
| Supplier management | ✓ | ✓ | ✓ | ✓ |
| Goods inwards / receiving | ✓ | ✓ | ✓ | ✓ |

### Module 6: Costing & Finance

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Cost per unit (BOM rollup) | — | ✓ | ✓ | ✓ |
| Margin tracking per product | — | ✓ | ✓ | ✓ |
| Inventory valuation | — | ✓ | ✓ | ✓ |
| Financial profitability dashboard | — | — | ✓ | ✓ |

### Module 7: Reports

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Dashboard overview | ✓ | ✓ | ✓ | ✓ |
| Inventory reports (stock on hand, movements) | — | ✓ | ✓ | ✓ |
| Purchasing reports (PO summary, spend by supplier) | — | ✓ | ✓ | ✓ |
| Date range filtering | — | ✓ | ✓ | ✓ |
| PDF + CSV export | — | — | ✓ | ✓ |

### Module 8: Capacity & Staffing

| Feature | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Departments + staffing levels | — | — | ✓ | ✓ |
| Capacity planning | — | — | ✓ | ✓ |
| Actual vs planned time tracking | — | — | ✓ | ✓ |

### Module 9: Platform & Support

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

## FAQ

Section heading: `Frequently asked questions`

**Q: What counts as a warehouse location?**  
A: A location is any physical place you store components or finished goods — a warehouse, a storage room, a third-party facility. Bin/aisle areas within a single location don't count as additional locations.

**Q: What do I get during the free trial?**  
A: Full Pro-level access for 14 days — no credit card required. At the end of the trial, your account downgrades to the tier you selected at sign-up. You can add a card and upgrade at any time during or after the trial.

**Q: Can I change tiers after signing up?**  
A: Yes — you can upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the next billing cycle.

**Q: Is pricing per seat or per account?**  
A: Flat per-account pricing — no per-seat fees. Growth and above include unlimited team members.

**Q: Do you offer discounts for annual billing?**  
A: Annual billing saves you around 20% compared to paying month-to-month. The toggle above shows you both options.

---

## Footer

`© 2026 Manuva · Privacy · Terms`

- Privacy links to `/privacy`
- Terms links to `/terms`

---

## Design notes

### Visual hierarchy
- Growth card is visually distinct: brand-colour border, slight shadow, "Most Popular" pill badge centred above the card
- Enterprise card has a tinted background (very light brand tint) rather than a border highlight
- Starter and Pro use an outline/ghost card style

### Billing toggle behaviour
- Toggle defaults to **Annual** on page load
- Annual state: thumb on the right, "Annual" label bold/brand-coloured, "Save ~20%" badge visible
- Monthly state: thumb on the left, "Monthly" label bold/brand-coloured, badge hidden
- Price shown is always per-month (e.g. "$249/mo")
- Annual: billing note says "Billed $X,XXX/yr" (yearly total)
- Monthly: billing note says "Billed monthly"
- Enterprise price never changes — always shows "Custom" and "Annual contract · custom onboarding"

### Limit chips on tier cards
- "1 location", "3 users" — neutral/grey chips on Starter
- "Unlimited locations", "Unlimited users" — green chips on Growth/Pro/Enterprise
- "5 locations" — neutral chip on Growth

### CTA buttons
- Starter / Pro: outline style (border, transparent background)
- Growth: primary style (solid brand colour, white text)
- Enterprise: dark style (near-black background, white text)

### Feature matrix
- Module names in a full-width header row, uppercase, small caps style
- Alternating or lightly separated feature rows
- Column widths: feature name ~40%, each tier ~15%
- Horizontally scrollable on mobile
- Table heading row: "Feature" left-aligned, tier names centre-aligned

### Free trial note
All plans display: "All plans include a 14-day free trial · No credit card required" (can be placed under the tier card grid or in the hero subhead).

---

## Links summary

| Target | URL |
|---|---|
| Logo | `/` |
| Sign in | `/login` |
| Starter CTA | `/login` |
| Growth CTA | `/login` |
| Pro CTA | `/login` |
| Enterprise CTA | `/contact` |
| Privacy | `/privacy` |
| Terms | `/terms` |
