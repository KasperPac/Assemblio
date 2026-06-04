import Link from "next/link";
import type { OrderLineStatus } from "@/lib/orders/order-line-status";
import StatusBadge from "../../../_ui/status-badge";
import styles from "./tabs.module.css";

type LineRow = {
  id: string;
  quantity: number;
  unit_sell_price: number;
  line_sell_price: number;
  variant_id: string | null;
  variant_title: string | null;
  variant_sku: string | null;
};

type Props = {
  lines: LineRow[];
  statuses: Map<string, OrderLineStatus>;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function lineComponentsPill(status: OrderLineStatus | undefined) {
  if (!status) return <span className={styles.dash}>—</span>;
  if (status.allocationState === "no-bom") {
    return <StatusBadge variant="danger">BOM needed</StatusBadge>;
  }
  if (status.allocationState === "empty-bom") {
    return <StatusBadge variant="danger">Empty BOM</StatusBadge>;
  }
  const shorts = status.components.filter((c) => c.isShort);
  if (shorts.length === 0) {
    return <StatusBadge variant="success">In stock</StatusBadge>;
  }
  const earliest = shorts
    .map((c) => c.earliestPoEta)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return (
    <StatusBadge variant="warning">
      Short{earliest ? ` · expected ${formatDate(earliest)}` : ""}
    </StatusBadge>
  );
}

export default function SalesItemsTab({ lines, statuses }: Props) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit price</th>
          <th>Total</th>
          <th>Components</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const status = statuses.get(line.id);
          const shorts = status?.components.filter((c) => c.isShort) ?? [];
          return (
            <tr key={line.id}>
              <td>
                <div className={styles.itemName}>
                  {line.variant_id ? (
                    <Link
                      href={`/app/products/variants/${line.variant_id}`}
                      className={styles.componentLink}
                    >
                      {line.variant_title ?? "—"}
                    </Link>
                  ) : (
                    line.variant_title ?? "—"
                  )}
                </div>
                <div className={styles.itemMeta}>
                  {line.variant_sku ? `SKU ${line.variant_sku}` : ""}
                  {status?.bom ? ` · BOM v${status.bom.version}` : ""}
                </div>
              </td>
              <td>{line.quantity}</td>
              <td>{formatCurrency(Number(line.unit_sell_price))}</td>
              <td>{formatCurrency(Number(line.line_sell_price))}</td>
              <td>
                {lineComponentsPill(status)}
                {shorts.length > 0 ? (
                  <ul className={styles.shortList}>
                    {shorts.map((c) => (
                      <li key={c.componentId}>
                        {c.componentId ? (
                          <Link
                            href={`/app/components/${c.componentId}`}
                            className={styles.componentLink}
                          >
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}
                        : need {c.requiredQty}, have {c.availableQty}
                        {c.earliestPoEta
                          ? ` · PO due ${formatDate(c.earliestPoEta)}`
                          : " · no PO"}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
