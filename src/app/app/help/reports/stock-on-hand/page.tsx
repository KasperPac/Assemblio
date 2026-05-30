import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function StockOnHandPage() {
  return (
    <ArticleLayout
      title="Stock on hand report"
      description="See current stock levels, values, and low-stock alerts across all locations."
      category="reports"
      relatedSlugs={["reports/valuation", "inventory/adjustments", "bom/allocation"]}
    >
      <p>The Stock on hand report gives you a snapshot of current inventory levels across all components and locations.</p>
      <div>
        <h3>Columns</h3>
        <ul>
          <li><strong>On hand</strong> — total physical quantity in stock</li>
          <li><strong>Allocated</strong> — reserved for confirmed orders</li>
          <li><strong>Available</strong> — on hand minus allocated</li>
          <li><strong>Reorder point</strong> — threshold below which a purchasing signal is raised</li>
          <li><strong>Value</strong> — on-hand quantity × unit cost</li>
        </ul>
      </div>
      <div>
        <h3>Filtering</h3>
        <p>Filter by location, category, or low-stock status. Sort by <strong>Available ascending</strong> to see the components closest to running out at the top.</p>
      </div>
      <Callout type="tip">
        Export the report as CSV for use in spreadsheets or accounting software. Click <strong>Export</strong> in the top-right corner.
      </Callout>
    </ArticleLayout>
  );
}
