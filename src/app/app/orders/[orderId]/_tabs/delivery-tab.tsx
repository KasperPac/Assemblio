import StatusBadge from "../../../_ui/status-badge";
import styles from "./tabs.module.css";
import { markLineShipped } from "../mark-shipped-action";

type LineDelivery = {
  id: string;
  label: string;
  quantity: number;
  shippedAt: Date | null;
};

type Props = {
  orderId: string;
  orderSource: string;
  lines: LineDelivery[];
};

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DeliveryTab({ orderId, orderSource, lines }: Props) {
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Line</th>
            <th>Qty</th>
            <th>Status</th>
            <th>Shipped at</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.label}</td>
              <td>{line.quantity}</td>
              <td>
                {line.shippedAt ? (
                  <StatusBadge variant="success">Shipped</StatusBadge>
                ) : (
                  <StatusBadge>Not shipped</StatusBadge>
                )}
              </td>
              <td>{line.shippedAt ? formatDateTime(line.shippedAt) : "—"}</td>
              <td>
                {!line.shippedAt ? (
                  <form action={markLineShipped}>
                    <input type="hidden" name="order_id" value={orderId} />
                    <input
                      type="hidden"
                      name="order_line_id"
                      value={line.id}
                    />
                    <button type="submit" className={styles.markBtn}>
                      Mark shipped
                    </button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orderSource === "shopify" ? (
        <p className={styles.dash} style={{ marginTop: 12 }}>
          For Shopify orders, status auto-flips on next sync when fulfillment lands.
          Manual &ldquo;Mark shipped&rdquo; remains available as an override.
        </p>
      ) : null}
    </>
  );
}
