import type { Metadata } from "next";
import PricingCards from "./_components/pricing-cards";
import FeatureMatrix from "./_components/feature-matrix";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing — Manuva",
  description: "Simple, transparent pricing for manufacturing teams on Shopify.",
};

const FAQ_ITEMS = [
  {
    q: "What counts as a warehouse location?",
    a: "A location is any physical place you store components or finished goods — a warehouse, a storage room, a third-party facility. Bin/aisle areas within a single location don't count as additional locations.",
  },
  {
    q: "What do I get during the free trial?",
    a: "Full Pro-level access for 14 days — no credit card required. At the end of the trial, your account downgrades to the tier you selected at sign-up. You can add a card and upgrade at any time during or after the trial.",
  },
  {
    q: "Can I change tiers after signing up?",
    a: "Yes — you can upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the next billing cycle.",
  },
  {
    q: "Is pricing per seat or per account?",
    a: "Flat per-account pricing — no per-seat fees. Growth and above include unlimited team members.",
  },
  {
    q: "Do you offer discounts for annual billing?",
    a: "Yes. Annual billing saves approximately 17% compared to paying month-to-month. The toggle on this page shows you both options.",
  },
];

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.logoLink}>Manuva</a>
        <a href="/login?redirect=/app" className={styles.loginLink}>Sign in</a>
      </header>

      <main>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Pricing</p>
          <h1 className={styles.headline}>Simple pricing for manufacturing teams</h1>
          <p className={styles.subhead}>
            One price per tier. No per-seat fees. No usage meters.
            Start free for 14 days — no credit card required.
          </p>
        </section>

        <PricingCards />

        <FeatureMatrix />

        <section className={styles.faq}>
          <h2 className={styles.faqHeading}>Frequently asked questions</h2>
          <dl className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className={styles.faqItem}>
                <dt className={styles.faqQ}>{item.q}</dt>
                <dd className={styles.faqA}>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>© 2026 Manuva · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
      </footer>
    </div>
  );
}
