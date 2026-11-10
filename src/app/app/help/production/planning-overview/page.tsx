import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function PlanningOverviewPage() {
  return (
    <ArticleLayout
      title="Planning module overview"
      description="Understand how production orders, capacity, and scheduling work together."
      category="production"
      relatedSlugs={["production/shopfloor", "production/capacity", "orders/fulfilment"]}
    >
      <p>
        Open the Floor Board to see the &quot;Production planning&quot; header. &quot;Open jobs&quot;
        counts distinct order lines with active, queued or blocked steps. The same job in several
        departments counts once; completed steps do not count. A dash means the count is unavailable.
      </p>
      <p>The Planning module gives you a visual timeline of all open production orders scheduled across your departments.</p>
      <div>
        <h3>Production orders</h3>
        <p>A production order is created from a sales order when you&apos;re ready to start manufacturing. It inherits the BOM, quantities, and target ship date.</p>
      </div>
      <div>
        <h3>The planning board</h3>
        <p>The planning board shows production orders on a Gantt-style timeline. Each order is a block that can be dragged to change its scheduled start date.</p>
      </div>
      <div>
        <h3>Capacity</h3>
        <p>Capacity is defined per department. The planning board shows a capacity bar for each department so you can see at a glance whether you are over- or under-scheduled.</p>
      </div>
      <Callout type="info">
        The Planning module is a premium feature. If you don&apos;t see it in the sidebar, visit the Billing page to upgrade your plan.
      </Callout>
    </ArticleLayout>
  );
}
