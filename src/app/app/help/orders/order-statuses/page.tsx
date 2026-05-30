import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function OrderStatusesPage() {
  return (
    <ArticleLayout
      title="Order statuses explained"
      description="What each order and line status means and when it changes."
      category="orders"
      relatedSlugs={["orders/fulfilment", "bom/allocation"]}
    >
      <p>Every order has an overall status, and each line item has its own status. These update automatically as the order moves through the fulfilment flow.</p>
      <div>
        <h3>Order statuses</h3>
        <ul>
          <li><strong>Pending</strong> — imported but not yet confirmed or processed</li>
          <li><strong>Awaiting Stock</strong> — confirmed but insufficient components available</li>
          <li><strong>In Production</strong> — production order created and in progress</li>
          <li><strong>Ready to Ship</strong> — production complete, awaiting dispatch</li>
          <li><strong>Shipped</strong> — dispatched, allocation released</li>
          <li><strong>Cancelled</strong> — cancelled, all allocation released</li>
        </ul>
      </div>
      <div>
        <h3>Line item statuses</h3>
        <ul>
          <li><strong>Unmatched</strong> — SKU not found in Manuva; requires manual resolution</li>
          <li><strong>Allocated</strong> — components fully reserved</li>
          <li><strong>Short</strong> — allocated partially; awaiting more stock</li>
          <li><strong>In Production</strong> — production in progress for this line</li>
          <li><strong>Complete</strong> — production finished</li>
        </ul>
      </div>
      <Callout type="info">
        The overall order status is derived from its line item statuses. An order only reaches <strong>Ready to Ship</strong> when all lines are Complete.
      </Callout>
    </ArticleLayout>
  );
}
