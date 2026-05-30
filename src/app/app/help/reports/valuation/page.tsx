import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ValuationPage() {
  return (
    <ArticleLayout
      title="Inventory valuation"
      description="Understand how inventory value is calculated and reported."
      category="reports"
      relatedSlugs={["reports/stock-on-hand", "purchasing/purchase-orders"]}
    >
      <p>The Inventory valuation report shows the total monetary value of your current stock, broken down by component, category, and supplier.</p>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>How value is calculated</h3>
        <p>Value is calculated as <strong>on-hand quantity × unit cost</strong>. Unit cost is taken from the most recent purchase order line for that component. If no PO exists, the unit cost falls back to the value set on the component record.</p>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>Filtering</h3>
        <p>Filter by category or supplier to drill into specific parts of your inventory. The total at the top updates to reflect the filtered set.</p>
      </div>
      <Callout type="info">
        Manuva uses a weighted-average cost method. Contact support to discuss alternative costing approaches.
      </Callout>
    </ArticleLayout>
  );
}
