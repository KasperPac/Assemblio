import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ShopifySyncPage() {
  return (
    <ArticleLayout
      title="Shopify order sync"
      description="How orders are imported from Shopify and kept in sync."
      category="orders"
      relatedSlugs={["getting-started/connect-shopify", "orders/order-statuses"]}
    >
      <p>Manuva polls your Shopify store regularly and imports new or updated orders automatically.</p>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>What syncs</h3>
        <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
          <li>New orders are imported within a few minutes of being placed</li>
          <li>Cancelled orders in Shopify are updated to Cancelled in Manuva</li>
          <li>Line item SKUs are matched to products; unmatched lines are flagged</li>
        </ul>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>What does not sync back</h3>
        <p>Manuva does not write back to Shopify. Order statuses and fulfilment status in Shopify are managed separately.</p>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>Manual sync</h3>
        <p>Go to <strong>Settings → Integrations</strong> and click <strong>Sync now</strong> to trigger an immediate sync.</p>
      </div>
      <Callout type="tip">
        If an order line shows &quot;Unmatched SKU&quot;, go to the product in Manuva and make sure its SKU matches exactly what is in Shopify — including capitalisation.
      </Callout>
    </ArticleLayout>
  );
}
