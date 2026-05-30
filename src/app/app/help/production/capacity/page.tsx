import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CapacityPage() {
  return (
    <ArticleLayout
      title="Departments and capacity"
      description="Set up departments, assign staff, and manage production capacity."
      category="production"
      relatedSlugs={["production/planning-overview", "production/shopfloor"]}
    >
      <p>Departments represent work centres or teams in your factory. Each department has a weekly capacity in hours.</p>
      <Steps>
        <Step>Open <strong>Settings → Departments</strong> and click <strong>New department</strong>.</Step>
        <Step>Give the department a name (e.g. &quot;Assembly&quot;, &quot;Packing&quot;, &quot;QC&quot;).</Step>
        <Step>Set the <strong>weekly capacity in hours</strong>.</Step>
        <Step>Save the department.</Step>
        <Step>Assign staff to departments from <strong>Settings → Staff</strong>.</Step>
        <Step>In your BOMs, assign each production step to a department so the planner knows which department is responsible.</Step>
      </Steps>
      <Callout type="info">
        If you don&apos;t assign production steps to departments, all steps are scheduled against the default department. Setting up departments is optional but recommended for accurate capacity planning.
      </Callout>
    </ArticleLayout>
  );
}
