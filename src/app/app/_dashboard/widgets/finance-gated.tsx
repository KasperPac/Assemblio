import styles from "../widget.module.css";
import Link from "next/link";

type FinanceGatedProps = { label: string; description: string };

export function FinanceGated({ label, description }: FinanceGatedProps) {
  return (
    <div className={styles.gated}>
      <p className={styles.gatedLabel}>{label}</p>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ink-faint)" }}>{description}</p>
      <Link href="/app/settings" className={styles.gatedCta}>
        Enable Shopify price sync in Settings →
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
