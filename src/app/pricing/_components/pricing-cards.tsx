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

const TIER_FEATURES: Record<Tier["id"], string[]> = {
  starter: STARTER_FEATURES,
  growth: GROWTH_FEATURES,
  pro: PRO_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
};

function formatPaidPrice(tier: Tier, period: BillingPeriod): string {
  return period === "annual"
    ? `$${tier.annualMonthly!}`
    : `$${tier.monthlyMonthly!}`;
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
          role="switch"
          aria-checked={period === "annual"}
          className={`${styles.toggleTrack} ${period === "annual" ? styles.annual : ""}`}
          onClick={() => setPeriod((p) => (p === "annual" ? "monthly" : "annual"))}
          aria-label="Toggle billing period"
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
          const isCustom = tier.annualMonthly === null;
          const price = !isCustom ? formatPaidPrice(tier, period) : "Custom";
          const ctaClass = tier.featured
            ? styles.ctaPrimary
            : tier.id === "enterprise"
            ? styles.ctaDark
            : styles.ctaOutline;
          const ctaHref =
            tier.id === "enterprise"
              ? "/contact"
              : `/apply?plan=${tier.id}&billing=${period}`;

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
