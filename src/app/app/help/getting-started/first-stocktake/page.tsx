import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function FirstStocktakePage() {
  return (
    <ArticleLayout
      title="Run your first stocktake"
      description="Count physical stock and reconcile it against the system."
      category="getting-started"
      relatedSlugs={["stocktake/running-a-stocktake", "stocktake/csv-import", "stocktake/resolving-discrepancies"]}
    >
      <p>
        A stocktake session lets you count physical stock and compare it to what Manuva expects.
        Any differences are shown as discrepancies, which you review before committing the adjusted quantities.
      </p>
      <Steps>
        <Step>Open <strong>Stocktake</strong> in the sidebar and click <strong>New session</strong>.</Step>
        <Step>Give the session a name (e.g. &quot;Monthly count — June 2026&quot;) and select the locations to count. Leave blank to count all locations.</Step>
        <Step>Work through the component list, entering the physical quantity you counted for each item.</Step>
        <Step>Optionally, import counts from a CSV file instead of entering them manually — see <em>Importing counts via CSV</em>.</Step>
        <Step>Click <strong>Submit</strong> to see the discrepancy report. Components where your count differs from the system are highlighted.</Step>
        <Step>Review each discrepancy. If you&apos;re confident in your count, click <strong>Commit</strong> to apply the adjustments.</Step>
      </Steps>
      <Callout type="warning">
        Committing a stocktake is permanent. The adjusted quantities replace the system values and appear in the movements log as stocktake adjustments. Review carefully before committing.
      </Callout>
    </ArticleLayout>
  );
}
