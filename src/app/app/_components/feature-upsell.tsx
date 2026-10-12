import Link from "next/link";
import styles from "./feature-upsell.module.css";
import { PLANS, type PlanTier } from "@/lib/plans";

export function FeatureUpsell({
  feature,
  requiredTier,
  headingLevel: Heading = "h1",
}: {
  feature: string;
  requiredTier: PlanTier;
  headingLevel?: "h1" | "h2";
}) {
  const tierName = PLANS[requiredTier]?.name ?? "a higher tier";
  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>{tierName} plan</p>
        <Heading className={styles.title}>{feature} is available on {tierName}</Heading>
        <p className={styles.subtitle}>
          Upgrade your workspace to unlock {feature}. You can switch back any
          time.
        </p>
        <Link href="/app/billing/paywall" className={styles.cta}>
          Upgrade to {tierName} →
        </Link>
      </div>
    </div>
  );
}
