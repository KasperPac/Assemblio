import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function RunningAStocktakePage() {
  return (
    <ArticleLayout
      title="Running a stocktake"
      description="Start a count session, enter quantities, and commit the results."
      category="stocktake"
      relatedSlugs={["stocktake/csv-import", "stocktake/resolving-discrepancies", "inventory/adjustments"]}
    >
      <Steps>
        <Step>Open <strong>Stocktake</strong> in the sidebar and click <strong>New session</strong>.</Step>
        <Step>Give the session a descriptive name (e.g. &quot;End of month — June 2026&quot;).</Step>
        <Step>Select the <strong>locations</strong> to count. Leave all locations selected to count everything.</Step>
        <Step>Work through the component list. For each component, enter the <strong>physical quantity you counted</strong>.</Step>
        <Step>Click <strong>Submit</strong> to generate the discrepancy report.</Step>
        <Step>Review discrepancies — see <em>Resolving discrepancies</em> if you need to recount.</Step>
        <Step>When you are satisfied the counts are correct, click <strong>Commit</strong> to apply the adjustments.</Step>
      </Steps>
      <Callout type="warning">
        Committing a stocktake is <strong>permanent and irreversible</strong>. Double-check your counts before committing.
      </Callout>
      <Callout type="tip">
        You can save a session as a draft and return to it later — counts are not committed until you explicitly click Commit.
      </Callout>
    </ArticleLayout>
  );
}
