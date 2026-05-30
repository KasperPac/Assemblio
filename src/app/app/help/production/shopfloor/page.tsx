import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ShopfloorPage() {
  return (
    <ArticleLayout
      title="Shopfloor view"
      description="How operators use the shopfloor queue to work through production tasks."
      category="production"
      relatedSlugs={["production/planning-overview", "production/capacity"]}
    >
      <p>The Shopfloor view is a simplified interface designed for use on a tablet or workstation on the factory floor.</p>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>For operators</h3>
        <ul style={{ paddingLeft: 20, lineHeight: 2, margin: 0 }}>
          <li>The queue shows tasks assigned to your department in scheduled order</li>
          <li>Tap a task to see the full instructions and component list</li>
          <li>Tap <strong>Start</strong> to record the actual start time</li>
          <li>Tap <strong>Complete</strong> when finished</li>
        </ul>
      </div>
      <div>
        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-bold)", margin: "8px 0 4px" }}>For supervisors</h3>
        <p>Supervisors see all tasks across all departments on the planning board, with real-time status shown as colour indicators.</p>
      </div>
      <Callout type="tip">
        Actual start and completion times are recorded automatically. This data feeds into the <strong>On-time fulfilment</strong> report over time.
      </Callout>
    </ArticleLayout>
  );
}
