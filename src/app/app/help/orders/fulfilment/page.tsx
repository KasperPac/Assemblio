import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function FulfilmentPage() {
  return (
    <ArticleLayout
      title="Order fulfilment flow"
      description="Track an order from import through production to shipment."
      category="orders"
      relatedSlugs={["orders/order-statuses", "bom/allocation", "orders/shopify-sync"]}
    >
      <p>Orders in Manuva follow a lifecycle from import to shipment.</p>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>1. Import</h3>
        <p>Orders arrive from Shopify automatically. Each line item is matched to a product by SKU. Unmatched lines are flagged and must be resolved before the order can proceed.</p>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>2. Allocation</h3>
        <p>Once confirmed, Manuva allocates the required components from stock. If stock is insufficient, the order enters <strong>Awaiting Stock</strong> status.</p>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>3. Production</h3>
        <p>Create a production order from the order detail page to schedule manufacturing. The Planning module assigns it to departments and tracks progress through the shopfloor.</p>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>4. Shipment</h3>
        <p>When production is complete, mark the order as <strong>Shipped</strong> from the order detail page. Allocated stock is released and the order is closed.</p>
      </div>
      <Callout type="info">
        Shipment status is not synced back to Shopify automatically. Use your Shopify admin or fulfilment service to update the customer-facing status.
      </Callout>
    </ArticleLayout>
  );
}
