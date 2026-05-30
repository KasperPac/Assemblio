import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function DeadStockPage() {
  return (
    <ArticleLayout
      title="Dead stock report"
      description="Identify components that haven't moved in a configurable time window."
      category="reports"
      relatedSlugs={["reports/stock-on-hand", "inventory/movements"]}
    >
      <p>Dead stock is inventory that has had no movements in a defined number of days. Holding dead stock ties up capital and warehouse space.</p>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>Using the report</h3>
        <p>Open <strong>Reports → Dead stock</strong>. Set the <strong>days with no movement</strong> threshold (default: 90 days). The report lists all components that have not moved in that window, with their on-hand quantity and value.</p>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>What to do with dead stock</h3>
        <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
          <li>Reduce or pause reorder quantities for slow-moving items</li>
          <li>Investigate whether the component is still used in any active BOM</li>
          <li>Write off genuinely obsolete stock with a Damaged adjustment</li>
          <li>Return to supplier if terms allow</li>
        </ul>
      </div>
      <Callout type="tip">
        Run the dead stock report before a stocktake — it helps you prioritise which bins to audit and which stock may be worth writing off before the count.
      </Callout>
    </ArticleLayout>
  );
}
