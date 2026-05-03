import styles from "./settings.module.css";

type Props = {
  meta: Record<string, unknown> | null;
};

const LABELS: Record<string, string> = {
  orders: "Orders",
  products: "Products",
  variants: "Variants",
  orderLines: "Order lines",
  order_lines: "Order lines",
  allocations: "Allocations",
  allocation_runs: "Allocation runs",
  fromWebhook: "Trigger",
  from_webhook: "Trigger",
  shop_domain: "Shop",
};

function formatLabel(key: string) {
  if (LABELS[key]) return LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export default function SyncMetaChips({ meta }: Props) {
  const entries = meta ? Object.entries(meta) : [];

  if (entries.length === 0) {
    return <span className={styles.meta}>No sync metadata yet.</span>;
  }

  return (
    <div className={styles.syncMetaChips}>
      {entries.map(([key, value]) => (
        <span key={key} className={styles.syncMetaChip}>
          <span className={styles.syncMetaChipLabel}>{formatLabel(key)}</span>
          <span className={styles.syncMetaChipValue}>{formatValue(value)}</span>
        </span>
      ))}
    </div>
  );
}
