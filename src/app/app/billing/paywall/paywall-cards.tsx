"use client";

import { useState } from "react";
import styles from "./paywall.module.css";
import type { BillingInterval, PlanTier } from "@/lib/plans";

interface PricedTier {
  id: PlanTier;
  name: string;
  tagline: string;
  featured: boolean;
  annualMonthly: number;
  monthlyMonthly: number;
  annualYearly: number;
  features: string[];
}

const PRICED_TIERS: ReadonlyArray<PricedTier> = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Small brands getting started with manufacturing ops.",
    featured: false,
    annualMonthly: 99,
    monthlyMonthly: 119,
    annualYearly: 1188,
    features: [
      "Inventory management",
      "Basic BOM builder",
      "Production orders",
      "Purchase orders + suppliers",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Scaling brands with multi-location and deeper workflows.",
    featured: true,
    annualMonthly: 249,
    monthlyMonthly: 299,
    annualYearly: 2988,
    features: [
      "Everything in Starter",
      "Multi-location inventory",
      "Advanced BOM (yield %, versions)",
      "Costing module",
      "Reports suite",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Capacity, costing, and API for professional manufacturers.",
    featured: false,
    annualMonthly: 499,
    monthlyMonthly: 599,
    annualYearly: 5988,
    features: [
      "Everything in Growth",
      "Capacity planning + staffing",
      "Financial profitability",
      "PDF + CSV export",
      "Priority support (< 4hr)",
    ],
  },
];

export default function PaywallCards({
  initialTier,
  initialBilling,
  canManageBilling,
}: {
  initialTier: PlanTier;
  initialBilling: BillingInterval;
  canManageBilling: boolean;
}) {
  const [billing, setBilling] = useState<BillingInterval>(initialBilling);

  return (
    <section className={styles.cards}>
      <div className={styles.toggleRow}>
        <span
          className={`${styles.toggleLabel} ${
            billing === "monthly" ? styles.toggleLabelActive : ""
          }`}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={billing === "annual"}
          aria-label="Toggle billing period"
          className={`${styles.toggleTrack} ${
            billing === "annual" ? styles.toggleTrackAnnual : ""
          }`}
          onClick={() =>
            setBilling((b) => (b === "annual" ? "monthly" : "annual"))
          }
        >
          <span className={styles.toggleThumb} />
        </button>
        <span
          className={`${styles.toggleLabel} ${
            billing === "annual" ? styles.toggleLabelActive : ""
          }`}
        >
          Annual
        </span>
        <span
          className={`${styles.saveBadge} ${
            billing === "annual" ? styles.saveBadgeVisible : ""
          }`}
        >
          Save ~20%
        </span>
      </div>

      <div className={styles.grid}>
        {PRICED_TIERS.map((tier) => {
          const price =
            billing === "annual" ? tier.annualMonthly : tier.monthlyMonthly;
          const billingNote =
            billing === "annual"
              ? `Billed $${tier.annualYearly.toLocaleString()}/yr`
              : "Billed monthly";
          const isCurrentTier = tier.id === initialTier;
          const badgeLabel = isCurrentTier
            ? "Your plan"
            : tier.featured
            ? "Most Popular"
            : null;
          const badgeClass = isCurrentTier
            ? styles.currentBadge
            : styles.popularBadge;

          return (
            <form
              key={tier.id}
              action="/api/billing/checkout"
              method="POST"
              className={`${styles.card} ${
                tier.featured ? styles.cardFeatured : ""
              } ${isCurrentTier ? styles.cardCurrent : ""}`}
            >
              <input type="hidden" name="tier" value={tier.id} />
              <input type="hidden" name="billing" value={billing} />

              {badgeLabel ? (
                <div className={badgeClass}>{badgeLabel}</div>
              ) : null}

              <p className={styles.tierName}>{tier.name}</p>
              <p className={styles.tierTagline}>{tier.tagline}</p>

              <p className={styles.priceMain}>
                ${price}
                <span className={styles.unit}>/mo</span>
              </p>
              <p className={styles.priceBillingNote}>{billingNote}</p>

              <button
                type="submit"
                disabled={!canManageBilling}
                title={
                  canManageBilling
                    ? undefined
                    : "Only workspace admins can change the plan."
                }
                className={`${styles.ctaBtn} ${
                  tier.featured ? styles.ctaPrimary : styles.ctaOutline
                }`}
              >
                {isCurrentTier
                  ? `Continue with ${tier.name}`
                  : `Choose ${tier.name}`}
              </button>

              <ul className={styles.features}>
                {tier.features.map((feature) => (
                  <li key={feature} className={styles.featureItem}>
                    <span className={styles.featureCheck}>✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </form>
          );
        })}
      </div>
    </section>
  );
}
