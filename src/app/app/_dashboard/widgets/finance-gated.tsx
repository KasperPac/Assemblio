import styles from "../widget.module.css";
import Link from "next/link";

function ChartLockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 14l3.5-4 3 3 3-5 3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      <rect x="11" y="8" width="7" height="6" rx="2" fill="currentColor" opacity="0.15"/>
      <path d="M13 8V6.5a1.5 1.5 0 013 0V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="11" y="8" width="7" height="6" rx="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="14.5" cy="11" r="0.8" fill="currentColor"/>
    </svg>
  );
}

type FinanceGatedProps = { label: string; description: string };

export function FinanceGated({ label, description }: FinanceGatedProps) {
  return (
    <div className={styles.gated}>
      <div className={styles.gatedIcon}>
        <ChartLockIcon />
      </div>
      <p className={styles.gatedLabel}>{label}</p>
      <p className={styles.gatedDescription}>{description}</p>
      <Link href="/app/settings" className={styles.gatedCta}>
        Enable in Settings →
      </Link>
    </div>
  );
}

export function RevenueTrendWidget() {
  return <FinanceGated label="Revenue trend" description="Monthly revenue for last 6 months — available once Shopify sell prices are synced." />;
}

export function GrossMarginWidget() {
  return <FinanceGated label="Gross margin %" description="Sell price minus COGS across orders — requires Shopify price sync." />;
}

export function AvgOrderValueWidget() {
  return <FinanceGated label="Average order value" description="Mean sell value per order — requires Shopify price sync." />;
}

export function GmroiWidget() {
  return <FinanceGated label="GMROI" description="Gross margin return per $1 of inventory held — requires Shopify price sync." />;
}

export function SellThroughRateWidget() {
  return <FinanceGated label="Sell-through rate" description="% of received inventory sold in the period — requires Shopify price sync." />;
}
