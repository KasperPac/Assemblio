import Link from "next/link";
import styles from "./trial-banner.module.css";
import { PLANS, type PlanTier } from "@/lib/plans";

export function TrialBanner({
  daysLeft,
  selectedTier,
}: {
  daysLeft: number;
  selectedTier: PlanTier;
}) {
  const planName = PLANS[selectedTier]?.name ?? "Starter";
  const daysCopy = daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        <strong className={styles.lead}>{daysCopy} in your free trial.</strong>{" "}
        You&apos;re on a Pro trial — after it ends, you&apos;ll be on the{" "}
        <strong>{planName}</strong> plan.
      </span>
      <Link href="/app/billing/paywall" className={styles.cta}>
        Upgrade now →
      </Link>
    </div>
  );
}
