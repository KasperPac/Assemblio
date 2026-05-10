# Pricing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public `/pricing` page at `src/app/pricing/` — tier cards with annual/monthly toggle, full feature matrix, and FAQ — based on the approved pricing spec.

**Architecture:** Static server component page with a single `"use client"` island (`PricingCards`) that manages the billing-period toggle and re-renders prices. Feature matrix is a pure server component driven by data from a shared constants file. All styling uses Manuva CSS Modules and design tokens.

**Tech Stack:** Next.js 15 App Router, CSS Modules, Manuva design tokens (`--brand-1`, `--bg-card`, `--ink-strong`, etc.), Vitest for data tests.

**Spec:** `docs/superpowers/specs/2026-05-10-pricing-design.md`

**Out of scope:** Stripe billing, plan enforcement, trial activation, auth gating.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/app/pricing/_data/tiers.ts` | Create | All pricing data: tiers, prices, feature matrix |
| `src/app/pricing/_data/tiers.test.ts` | Create | Data integrity tests |
| `src/app/pricing/_components/pricing-cards.tsx` | Create | `"use client"` — billing toggle + tier card grid |
| `src/app/pricing/_components/pricing-cards.module.css` | Create | Card + toggle styles |
| `src/app/pricing/_components/feature-matrix.tsx` | Create | Server component — full feature comparison table |
| `src/app/pricing/_components/feature-matrix.module.css` | Create | Table styles |
| `src/app/pricing/page.tsx` | Create | Server component — full page layout + metadata |
| `src/app/pricing/pricing.module.css` | Create | Page-level layout styles |
| `src/app/page.tsx` | Modify | Add "Pricing" link to header nav |

---

### Task 0: Pricing data constants and types

**Goal:** Create the single source of truth for all pricing data — tier definitions, prices, and the full feature matrix — with a data integrity test.

**Files:**
- Create: `src/app/pricing/_data/tiers.ts`
- Create: `src/app/pricing/_data/tiers.test.ts`

**Acceptance Criteria:**
- [ ] `TIERS` array has exactly 4 entries: starter, growth, pro, enterprise
- [ ] Annual monthly price is lower than monthly price for all paid tiers
- [ ] `annualYearly` equals `annualMonthly * 12` for all paid tiers
- [ ] `FEATURE_MODULES` covers all 8 modules from the spec
- [ ] All tests pass: `npm test`

**Verify:** `npm test -- tiers` → all tests pass

**Steps:**

- [ ] **Step 1: Create `src/app/pricing/_data/tiers.ts`**

```typescript
export type BillingPeriod = "annual" | "monthly";

export type TierLimit = {
  locations: string;
  users: string;
};

export type FeatureCell =
  | true          // included, standard checkmark
  | false         // not included, dash
  | string;       // included with a note (e.g. "Basic", "< 4hr response")

export type FeatureRow = {
  name: string;
  starter: FeatureCell;
  growth: FeatureCell;
  pro: FeatureCell;
  enterprise: FeatureCell;
};

export type FeatureModule = {
  name: string;
  features: FeatureRow[];
};

export type Tier = {
  id: "starter" | "growth" | "pro" | "enterprise";
  name: string;
  tagline: string;
  annualMonthly: number | null;   // price per month when billed annually
  monthlyMonthly: number | null;  // price per month when billed monthly
  annualYearly: number | null;    // total annual charge
  cta: string;
  featured: boolean;
  limits: TierLimit;
};

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Small brands getting started with manufacturing ops",
    annualMonthly: 99,
    monthlyMonthly: 119,
    annualYearly: 1188,
    cta: "Start free trial",
    featured: false,
    limits: { locations: "1 location", users: "3 users" },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Scaling brands with multi-location and deeper workflows",
    annualMonthly: 249,
    monthlyMonthly: 299,
    annualYearly: 2988,
    cta: "Start free trial",
    featured: true,
    limits: { locations: "5 locations", users: "Unlimited users" },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Professional manufacturers needing capacity, costing & API",
    annualMonthly: 499,
    monthlyMonthly: 599,
    annualYearly: 5988,
    cta: "Start free trial",
    featured: false,
    limits: { locations: "Unlimited locations", users: "Unlimited users" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Large operations, custom requirements, dedicated support",
    annualMonthly: null,
    monthlyMonthly: null,
    annualYearly: null,
    cta: "Contact sales",
    featured: false,
    limits: { locations: "Unlimited", users: "Unlimited" },
  },
];

export const FEATURE_MODULES: FeatureModule[] = [
  {
    name: "Plan Limits",
    features: [
      { name: "Warehouse locations",  starter: "1",          growth: "5",          pro: "Unlimited", enterprise: "Unlimited" },
      { name: "Team members",         starter: "3",          growth: "Unlimited",  pro: "Unlimited", enterprise: "Unlimited" },
      { name: "SKUs / components",    starter: "Unlimited",  growth: "Unlimited",  pro: "Unlimited", enterprise: "Unlimited" },
    ],
  },
  {
    name: "Shopify Integration",
    features: [
      { name: "Product + variant sync",           starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Order sync + allocation",           starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Webhook-driven real-time sync",     starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Multiple Shopify stores",           starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Inventory Management",
    features: [
      { name: "Component inventory + balances",   starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Inventory movements ledger",       starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Stocktake",                        starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Activity log",                     starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Low stock alerts",                 starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Bin / aisle locations",            starter: false, growth: true,  pro: true,  enterprise: true  },
    ],
  },
  {
    name: "BOM & Manufacturing",
    features: [
      { name: "BOM builder",                      starter: "Basic", growth: true,  pro: true,  enterprise: true  },
      { name: "Production orders",                starter: true,    growth: true,  pro: true,  enterprise: true  },
      { name: "Component allocation engine",      starter: true,    growth: true,  pro: true,  enterprise: true  },
      { name: "Yield % per BOM line",             starter: false,   growth: true,  pro: true,  enterprise: true  },
      { name: "BOM versioning + draft/publish",   starter: false,   growth: true,  pro: true,  enterprise: true  },
      { name: "BOM version comparison",           starter: false,   growth: true,  pro: true,  enterprise: true  },
      { name: "BOM templates",                    starter: false,   growth: true,  pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Purchasing",
    features: [
      { name: "Purchase orders",                  starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Supplier management",              starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Goods inwards / receiving",        starter: true,  growth: true,  pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Costing & Finance",
    features: [
      { name: "Cost per unit (BOM rollup)",           starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Margin tracking per product",          starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Inventory valuation",                  starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Financial profitability dashboard",    starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Reports",
    features: [
      { name: "Dashboard overview",                             starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Inventory reports (stock on hand, movements)",   starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "Purchasing reports (PO summary, spend by supplier)", starter: false, growth: true, pro: true, enterprise: true },
      { name: "Date range filtering",                           starter: false, growth: true,  pro: true,  enterprise: true  },
      { name: "PDF + CSV export",                               starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Capacity & Staffing",
    features: [
      { name: "Departments + staffing levels",        starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Capacity planning",                    starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Actual vs planned time tracking",      starter: false, growth: false, pro: true,  enterprise: true  },
    ],
  },
  {
    name: "Platform & Support",
    features: [
      { name: "API access",                           starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Email support",                        starter: true,  growth: true,  pro: true,  enterprise: true  },
      { name: "Priority support (< 4hr response)",   starter: false, growth: false, pro: true,  enterprise: true  },
      { name: "Dedicated account manager",            starter: false, growth: false, pro: false, enterprise: true  },
      { name: "Custom onboarding + training",         starter: false, growth: false, pro: false, enterprise: true  },
      { name: "SSO / advanced security",              starter: false, growth: false, pro: false, enterprise: true  },
      { name: "SLA + uptime guarantee",               starter: false, growth: false, pro: false, enterprise: true  },
      { name: "Custom integrations",                  starter: false, growth: false, pro: false, enterprise: true  },
    ],
  },
];
```

- [ ] **Step 2: Create `src/app/pricing/_data/tiers.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { TIERS, FEATURE_MODULES } from "./tiers";

describe("TIERS", () => {
  it("has exactly 4 tiers", () => {
    expect(TIERS).toHaveLength(4);
  });

  it("tier IDs are starter, growth, pro, enterprise in order", () => {
    expect(TIERS.map((t) => t.id)).toEqual(["starter", "growth", "pro", "enterprise"]);
  });

  it("annual monthly price is lower than monthly price for paid tiers", () => {
    const paid = TIERS.filter((t) => t.annualMonthly !== null);
    for (const tier of paid) {
      expect(tier.annualMonthly!).toBeLessThan(tier.monthlyMonthly!);
    }
  });

  it("annualYearly equals annualMonthly * 12 for paid tiers", () => {
    const paid = TIERS.filter((t) => t.annualMonthly !== null);
    for (const tier of paid) {
      expect(tier.annualYearly).toBe(tier.annualMonthly! * 12);
    }
  });

  it("exactly one tier is featured", () => {
    expect(TIERS.filter((t) => t.featured)).toHaveLength(1);
  });

  it("enterprise tier has null prices", () => {
    const enterprise = TIERS.find((t) => t.id === "enterprise")!;
    expect(enterprise.annualMonthly).toBeNull();
    expect(enterprise.monthlyMonthly).toBeNull();
    expect(enterprise.annualYearly).toBeNull();
  });
});

describe("FEATURE_MODULES", () => {
  it("has exactly 9 modules", () => {
    expect(FEATURE_MODULES).toHaveLength(9);
  });

  it("every feature row has all four tier keys", () => {
    for (const mod of FEATURE_MODULES) {
      for (const feature of mod.features) {
        expect(feature).toHaveProperty("starter");
        expect(feature).toHaveProperty("growth");
        expect(feature).toHaveProperty("pro");
        expect(feature).toHaveProperty("enterprise");
      }
    }
  });

  it("no enterprise feature is false when pro is true", () => {
    for (const mod of FEATURE_MODULES) {
      for (const feature of mod.features) {
        if (feature.pro === true) {
          expect(feature.enterprise).not.toBe(false);
        }
      }
    }
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tiers
```

Expected output: all tests pass. Fix any data mismatches in `tiers.ts` before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/app/pricing/_data/
git commit -m "feat(pricing): add tier data constants and integrity tests"
```

---

### Task 1: PricingCards — billing toggle and tier card grid

**Goal:** Build the `"use client"` component that owns the annual/monthly toggle and renders the four tier cards.

**Files:**
- Create: `src/app/pricing/_components/pricing-cards.tsx`
- Create: `src/app/pricing/_components/pricing-cards.module.css`

**Acceptance Criteria:**
- [ ] Toggle defaults to annual billing
- [ ] Toggling to monthly updates all three paid tier prices simultaneously
- [ ] Annual pricing shows the yearly total as a billing note
- [ ] Monthly pricing shows the monthly rate with no yearly note
- [ ] Growth card has "Most Popular" badge and brand-coloured border
- [ ] Enterprise card shows "Custom" with a "Contact sales" CTA
- [ ] All CTA buttons are anchor tags (href placeholder `#trial` / `#contact`)
- [ ] "Save ~20%" badge visible only when annual is selected

**Verify:** `npm run dev` → navigate to `http://localhost:3000/pricing` → toggle works, prices update

**Steps:**

- [ ] **Step 1: Create `pricing-cards.module.css`**

```css
.section {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

.toggleRow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 36px;
}

.toggleLabel {
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--ink-muted);
  transition: color 0.15s;
}

.toggleLabel.active {
  color: var(--brand-1);
  font-weight: 600;
}

.toggleTrack {
  width: 44px;
  height: 24px;
  background: var(--bg-input);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-pill);
  display: flex;
  align-items: center;
  padding: 2px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.toggleTrack.annual {
  background: var(--brand-1);
  border-color: var(--brand-1);
}

.toggleThumb {
  width: 18px;
  height: 18px;
  background: white;
  border-radius: var(--radius-pill);
  transition: transform 0.15s;
  transform: translateX(0);
}

.toggleTrack.annual .toggleThumb {
  transform: translateX(20px);
}

.saveBadge {
  font-size: var(--fs-xs);
  font-weight: 600;
  background: var(--ok-dim);
  color: var(--ok);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent);
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  opacity: 0;
  transition: opacity 0.15s;
}

.saveBadge.visible {
  opacity: 1;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 560px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.card {
  position: relative;
  background: var(--bg-card);
  border: 2px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.card.featured {
  border-color: var(--brand-1);
  box-shadow: 0 0 0 4px var(--brand-dim);
}

.popularBadge {
  position: absolute;
  top: -13px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--brand-1);
  color: var(--ink-on-brand);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  padding: 3px 14px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.tierName {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--ink-strong);
  margin: 0 0 4px;
}

.tierTagline {
  font-size: var(--fs-sm);
  color: var(--ink-faint);
  margin: 0 0 18px;
  line-height: 1.5;
  min-height: 36px;
}

.priceMain {
  font-size: 32px;
  font-weight: 800;
  color: var(--ink-strong);
  letter-spacing: -0.03em;
  line-height: 1;
  margin-bottom: 4px;
}

.priceMain .unit {
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--ink-muted);
}

.priceCustom {
  font-size: var(--fs-xl);
  font-weight: 800;
  color: var(--brand-1);
  margin-bottom: 4px;
  padding-top: 4px;
}

.priceBillingNote {
  font-size: var(--fs-xs);
  color: var(--ink-faint);
  margin: 0 0 20px;
  min-height: 16px;
}

.ctaBtn {
  display: block;
  width: 100%;
  padding: 10px;
  border-radius: var(--radius-md);
  font-size: var(--fs-md);
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s;
  margin-bottom: 20px;
}

.ctaBtn:hover {
  opacity: 0.85;
}

.ctaPrimary {
  background: var(--brand-1);
  color: var(--ink-on-brand);
}

.ctaOutline {
  background: transparent;
  border: 1.5px solid var(--stroke-strong);
  color: var(--ink-strong);
}

.ctaDark {
  background: var(--ink-strong);
  color: var(--bg-card);
}

.limitsRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--stroke-card);
  margin-bottom: 14px;
}

.chip {
  display: inline-block;
  font-size: var(--fs-xs);
  font-weight: 500;
  background: var(--surface-1);
  color: var(--ink-muted);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
}

.chip.green {
  background: var(--ok-dim);
  color: var(--ok);
}

.features {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.featureItem {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  line-height: 1.4;
}

.featureCheck {
  color: var(--ok);
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1.4;
}
```

- [ ] **Step 2: Create `pricing-cards.tsx`**

```tsx
"use client";

import { useState } from "react";
import { TIERS, type BillingPeriod, type Tier } from "../_data/tiers";
import styles from "./pricing-cards.module.css";

const STARTER_FEATURES = [
  "Inventory management",
  "Basic BOM builder",
  "Production orders",
  "Purchase orders + suppliers",
  "Stocktake",
  "Email support",
];

const GROWTH_FEATURES = [
  "Everything in Starter",
  "Multi-location + bin management",
  "Advanced BOM (yield %, versions)",
  "Costing module",
  "Reports suite",
];

const PRO_FEATURES = [
  "Everything in Growth",
  "Capacity planning + staffing",
  "Financial profitability",
  "Advanced reports + PDF/CSV export",
  "API access",
  "Priority support (< 4hr)",
];

const ENTERPRISE_FEATURES = [
  "Everything in Pro",
  "Dedicated account manager",
  "Custom onboarding + training",
  "SSO / advanced security",
  "SLA + uptime guarantee",
];

const TIER_FEATURES: Record<string, string[]> = {
  starter: STARTER_FEATURES,
  growth: GROWTH_FEATURES,
  pro: PRO_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
};

function getPrice(tier: Tier, period: BillingPeriod): string {
  if (tier.annualMonthly === null) return "Custom";
  return period === "annual"
    ? `$${tier.annualMonthly}`
    : `$${tier.monthlyMonthly}`;
}

function getBillingNote(tier: Tier, period: BillingPeriod): string {
  if (tier.annualYearly === null) return "Annual contract · custom onboarding";
  if (period === "annual") return `Billed $${tier.annualYearly.toLocaleString()}/yr`;
  return "Billed monthly";
}

function isUnlimited(value: string): boolean {
  return value.toLowerCase().startsWith("unlimited");
}

export default function PricingCards() {
  const [period, setPeriod] = useState<BillingPeriod>("annual");

  return (
    <div className={styles.section}>
      {/* Billing toggle */}
      <div className={styles.toggleRow}>
        <span
          className={`${styles.toggleLabel} ${period === "monthly" ? styles.active : ""}`}
        >
          Monthly
        </span>
        <button
          className={`${styles.toggleTrack} ${period === "annual" ? styles.annual : ""}`}
          onClick={() => setPeriod((p) => (p === "annual" ? "monthly" : "annual"))}
          aria-label={`Switch to ${period === "annual" ? "monthly" : "annual"} billing`}
          type="button"
        >
          <div className={styles.toggleThumb} />
        </button>
        <span
          className={`${styles.toggleLabel} ${period === "annual" ? styles.active : ""}`}
        >
          Annual
        </span>
        <span className={`${styles.saveBadge} ${period === "annual" ? styles.visible : ""}`}>
          Save ~20%
        </span>
      </div>

      {/* Tier cards */}
      <div className={styles.grid}>
        {TIERS.map((tier) => {
          const price = getPrice(tier, period);
          const isCustom = tier.annualMonthly === null;
          const ctaClass = tier.featured
            ? styles.ctaPrimary
            : tier.id === "enterprise"
            ? styles.ctaDark
            : styles.ctaOutline;
          const ctaHref = tier.id === "enterprise" ? "#contact" : "#trial";

          return (
            <div
              key={tier.id}
              className={`${styles.card} ${tier.featured ? styles.featured : ""}`}
            >
              {tier.featured && (
                <div className={styles.popularBadge}>Most Popular</div>
              )}

              <p className={styles.tierName}>{tier.name}</p>
              <p className={styles.tierTagline}>{tier.tagline}</p>

              {isCustom ? (
                <p className={styles.priceCustom}>Custom</p>
              ) : (
                <p className={styles.priceMain}>
                  {price}
                  <span className={styles.unit}>/mo</span>
                </p>
              )}
              <p className={styles.priceBillingNote}>
                {getBillingNote(tier, period)}
              </p>

              <a href={ctaHref} className={`${styles.ctaBtn} ${ctaClass}`}>
                {tier.cta}
              </a>

              <div className={styles.limitsRow}>
                <span
                  className={`${styles.chip} ${isUnlimited(tier.limits.locations) ? styles.green : ""}`}
                >
                  {tier.limits.locations}
                </span>
                {tier.limits.users && (
                  <span
                    className={`${styles.chip} ${isUnlimited(tier.limits.users) ? styles.green : ""}`}
                  >
                    {tier.limits.users}
                  </span>
                )}
              </div>

              <div className={styles.features}>
                {TIER_FEATURES[tier.id].map((feature) => (
                  <div key={feature} className={styles.featureItem}>
                    <span className={styles.featureCheck}>✓</span>
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pricing/_components/pricing-cards.tsx src/app/pricing/_components/pricing-cards.module.css
git commit -m "feat(pricing): add PricingCards client component with billing toggle"
```

---

### Task 2: FeatureMatrix server component

**Goal:** Build the static server component that renders the full 9-module feature comparison table.

**Files:**
- Create: `src/app/pricing/_components/feature-matrix.tsx`
- Create: `src/app/pricing/_components/feature-matrix.module.css`

**Acceptance Criteria:**
- [ ] All 9 modules from `FEATURE_MODULES` render with correct section headers
- [ ] ✓ renders for `true` cells, in green
- [ ] `—` renders for `false` cells, faint
- [ ] String values (e.g. "Basic", "Unlimited") render as text instead of ✓
- [ ] Module header rows are visually distinct from feature rows
- [ ] Table is readable on mobile (horizontal scroll on small screens)

**Verify:** `npm run dev` → navigate to `/pricing` → scroll to feature matrix → spot-check BOM module rows

**Steps:**

- [ ] **Step 1: Create `feature-matrix.module.css`**

```css
.wrapper {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  overflow-x: auto;
}

.heading {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--ink-strong);
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}

.subheading {
  font-size: var(--fs-base);
  color: var(--ink-muted);
  margin: 0 0 28px;
}

.table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}

.table th {
  padding: 10px 16px;
  text-align: center;
  font-weight: 700;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  border-bottom: 2px solid var(--stroke);
  white-space: nowrap;
}

.table th.featureCol {
  text-align: left;
  width: 40%;
  color: var(--ink-strong);
}

.table td {
  padding: 8px 16px;
  border-bottom: 1px solid var(--stroke-card);
  text-align: center;
  color: var(--ink-strong);
}

.table td.featureCol {
  text-align: left;
  color: var(--ink-muted);
}

.table tr:hover td {
  background: var(--surface-hover);
}

.sectionRow td {
  background: var(--brand-dim);
  color: var(--brand-1);
  font-weight: 700;
  font-size: var(--fs-xs);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  padding: 8px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--brand-1) 15%, transparent);
}

.check {
  color: var(--ok);
  font-size: 14px;
  font-weight: 700;
}

.dash {
  color: var(--stroke-strong);
  font-size: 14px;
}

.noteText {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--ink-muted);
}
```

- [ ] **Step 2: Create `feature-matrix.tsx`**

```tsx
import { FEATURE_MODULES, type FeatureCell } from "../_data/tiers";
import styles from "./feature-matrix.module.css";

function Cell({ value }: { value: FeatureCell }) {
  if (value === true) return <span className={styles.check}>✓</span>;
  if (value === false) return <span className={styles.dash}>—</span>;
  return <span className={styles.noteText}>{value}</span>;
}

export default function FeatureMatrix() {
  return (
    <div className={styles.wrapper}>
      <h2 className={styles.heading}>Compare all features</h2>
      <p className={styles.subheading}>
        Every feature, grouped by module. All plans include unlimited SKUs and a 14-day free trial.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.featureCol}>Feature</th>
            <th>Starter<br /><span style={{ fontWeight: 400, color: "var(--ink-faint)" }}>$99/mo</span></th>
            <th>Growth<br /><span style={{ fontWeight: 400, color: "var(--ink-faint)" }}>$249/mo</span></th>
            <th>Pro<br /><span style={{ fontWeight: 400, color: "var(--ink-faint)" }}>$499/mo</span></th>
            <th>Enterprise<br /><span style={{ fontWeight: 400, color: "var(--ink-faint)" }}>Custom</span></th>
          </tr>
        </thead>
        <tbody>
          {FEATURE_MODULES.map((mod) => (
            <>
              <tr key={`mod-${mod.name}`} className={styles.sectionRow}>
                <td colSpan={5}>{mod.name}</td>
              </tr>
              {mod.features.map((feature) => (
                <tr key={feature.name}>
                  <td className={styles.featureCol}>{feature.name}</td>
                  <td><Cell value={feature.starter} /></td>
                  <td><Cell value={feature.growth} /></td>
                  <td><Cell value={feature.pro} /></td>
                  <td><Cell value={feature.enterprise} /></td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pricing/_components/feature-matrix.tsx src/app/pricing/_components/feature-matrix.module.css
git commit -m "feat(pricing): add FeatureMatrix server component"
```

---

### Task 3: Pricing page, FAQ, and nav link

**Goal:** Compose the full `/pricing` page — hero, PricingCards, FeatureMatrix, FAQ — and add a "Pricing" link to the root page nav.

**Files:**
- Create: `src/app/pricing/page.tsx`
- Create: `src/app/pricing/pricing.module.css`
- Modify: `src/app/page.tsx` (add nav link)

**Acceptance Criteria:**
- [ ] `/pricing` renders without errors
- [ ] Page title is "Pricing — Manuva"
- [ ] Hero section has a headline and subhead (not a feature list)
- [ ] PricingCards renders with working toggle
- [ ] FeatureMatrix renders below the cards
- [ ] FAQ section has at least 3 questions from the spec
- [ ] Trial disclaimer ("14-day free trial · No credit card required") is visible
- [ ] Root page nav has a "Pricing" link pointing to `/pricing`

**Verify:** `npm run dev` → `http://localhost:3000/pricing` → full page visible with all sections; `http://localhost:3000` → nav has "Pricing" link

**Steps:**

- [ ] **Step 1: Create `pricing.module.css`**

```css
.page {
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--ink-strong);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px clamp(20px, 4vw, 72px);
  border-bottom: 1px solid var(--stroke-card);
}

.brand {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--ink-strong);
  text-decoration: none;
  letter-spacing: -0.02em;
}

.nav {
  display: flex;
  gap: 24px;
}

.nav a {
  font-size: var(--fs-base);
  font-weight: 500;
  color: var(--ink-muted);
  text-decoration: none;
  transition: color 0.15s;
}

.nav a:hover {
  color: var(--ink-strong);
}

.ctaLink {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--brand-1);
  text-decoration: none;
}

.hero {
  text-align: center;
  padding: 72px clamp(20px, 4vw, 72px) 48px;
  max-width: 680px;
  margin: 0 auto;
}

.eyebrow {
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--brand-1);
  margin: 0 0 16px;
}

.headline {
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 800;
  color: var(--ink-strong);
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0 0 16px;
}

.subhead {
  font-size: var(--fs-lg);
  color: var(--ink-muted);
  line-height: 1.6;
  margin: 0 0 12px;
}

.trialNote {
  font-size: var(--fs-sm);
  color: var(--ink-faint);
}

.cardsSection {
  padding: 0 clamp(20px, 4vw, 72px) 72px;
}

.matrixSection {
  padding: 72px clamp(20px, 4vw, 72px);
  background: var(--bg-card-alt);
  border-top: 1px solid var(--stroke-card);
  border-bottom: 1px solid var(--stroke-card);
}

.faqSection {
  padding: 72px clamp(20px, 4vw, 72px);
  max-width: 720px;
  margin: 0 auto;
}

.faqHeading {
  font-size: var(--fs-2xl);
  font-weight: 700;
  color: var(--ink-strong);
  letter-spacing: -0.02em;
  margin: 0 0 32px;
}

.faqItem {
  padding: 20px 0;
  border-bottom: 1px solid var(--stroke-card);
}

.faqItem:last-child {
  border-bottom: none;
}

.faqQ {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--ink-strong);
  margin: 0 0 8px;
}

.faqA {
  font-size: var(--fs-base);
  color: var(--ink-muted);
  line-height: 1.7;
  margin: 0;
}

.footer {
  text-align: center;
  padding: 32px;
  border-top: 1px solid var(--stroke-card);
  font-size: var(--fs-sm);
  color: var(--ink-faint);
}
```

- [ ] **Step 2: Create `page.tsx`**

```tsx
import type { Metadata } from "next";
import PricingCards from "./_components/pricing-cards";
import FeatureMatrix from "./_components/feature-matrix";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing — Manuva",
  description:
    "Simple, transparent pricing for Shopify-connected manufacturers. Start free, upgrade as you grow.",
};

const FAQ = [
  {
    q: "What counts as a warehouse location?",
    a: "A location is a physical place where you store components — a warehouse, storeroom, or production floor. Bin and aisle subdivisions within a location don't count as separate locations.",
  },
  {
    q: "What's included in the free trial?",
    a: "Every trial gives you full Pro-level access for 14 days. No credit card required. At the end of the trial your account switches to the plan you selected at sign-up — or you can upgrade at any time.",
  },
  {
    q: "Can I change my plan later?",
    a: "Yes. You can upgrade at any time and your billing adjusts immediately on a pro-rated basis. Downgrades take effect at the end of your current billing period.",
  },
  {
    q: "Do you offer a discount for annual billing?",
    a: "Yes — annual billing saves approximately 20% compared to paying month-to-month. The annual amount is charged upfront as a single payment.",
  },
  {
    q: "What happens if you raise your prices?",
    a: "Existing customers keep their current rate for 3 months from the date any price increase takes effect. We'll always give at least 30 days notice before a change.",
  },
];

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.brand}>Manuva</a>
        <nav className={styles.nav}>
          <a href="/app">App</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <a href="/login?redirect=/app" className={styles.ctaLink}>
          Sign in →
        </a>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Pricing</p>
        <h1 className={styles.headline}>
          Simple pricing for manufacturers who mean business
        </h1>
        <p className={styles.subhead}>
          Start free, grow at your own pace. Upgrade only when you need more.
        </p>
        <p className={styles.trialNote}>
          14-day free trial &nbsp;·&nbsp; No credit card required &nbsp;·&nbsp; Cancel any time
        </p>
      </section>

      <section className={styles.cardsSection}>
        <PricingCards />
      </section>

      <section className={styles.matrixSection}>
        <FeatureMatrix />
      </section>

      <section className={styles.faqSection}>
        <h2 className={styles.faqHeading}>Frequently asked questions</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q} className={styles.faqItem}>
            <p className={styles.faqQ}>{q}</p>
            <p className={styles.faqA}>{a}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        © {new Date().getFullYear()} Manuva. All rights reserved.
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Add "Pricing" link to root page nav**

In `src/app/page.tsx`, find the `<nav>` block:

```tsx
<nav className={styles.nav}>
  <a href="#modules">Modules</a>
  <a href="#progress">Progress</a>
  <a href="#how">How it works</a>
  <a href="#gallery">Screens</a>
  <a href="#stack">Stack</a>
</nav>
```

Add a Pricing link after Stack:

```tsx
<nav className={styles.nav}>
  <a href="#modules">Modules</a>
  <a href="#progress">Progress</a>
  <a href="#how">How it works</a>
  <a href="#gallery">Screens</a>
  <a href="#stack">Stack</a>
  <a href="/pricing">Pricing</a>
</nav>
```

- [ ] **Step 4: Run dev server and verify**

```bash
npm run dev
```

Check:
- `http://localhost:3000/pricing` — full page renders, toggle works, matrix visible, FAQ present
- `http://localhost:3000` — nav has "Pricing" link

- [ ] **Step 5: Commit**

```bash
git add src/app/pricing/page.tsx src/app/pricing/pricing.module.css src/app/page.tsx
git commit -m "feat(pricing): add public pricing page with FAQ and nav link"
```
