import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function AllocationPage() {
  return (
    <ArticleLayout
      title="How allocation works"
      description="Learn how Manuva reserves stock against open orders."
      category="bom"
      relatedSlugs={["orders/fulfilment", "inventory/adjustments", "bom/creating-a-bom"]}
    >
      <p>
        Allocation is how Manuva reserves component stock for confirmed orders. Once stock is
        allocated, it cannot be used by other orders — this prevents over-promising on available inventory.
      </p>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>Allocated vs available</h3>
        <p>On the Inventory page, each component shows three figures:</p>
        <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
          <li><strong>On hand</strong> — total physical stock</li>
          <li><strong>Allocated</strong> — reserved for confirmed orders</li>
          <li><strong>Available</strong> — on hand minus allocated</li>
        </ul>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>Insufficient stock</h3>
        <p>If there isn&apos;t enough available stock to fully allocate an order, the order moves to <strong>Awaiting Stock</strong> status.</p>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>Releasing allocation</h3>
        <p>Allocated stock is released back to available when an order is cancelled or marked as shipped.</p>
      </div>
      <Callout type="tip">
        The Dashboard <strong>Low stock alerts</strong> widget flags components where available stock (after allocation) is below the reorder point.
      </Callout>
    </ArticleLayout>
  );
}
