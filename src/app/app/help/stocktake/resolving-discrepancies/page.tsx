import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ResolvingDiscrepanciesPage() {
  return (
    <ArticleLayout
      title="Resolving discrepancies"
      description="What to do when counted quantities don't match the system."
      category="stocktake"
      relatedSlugs={["stocktake/running-a-stocktake", "inventory/adjustments"]}
    >
      <p>After submitting a stocktake session, Manuva shows a discrepancy report listing all components where your counted quantity differs from the system&apos;s expected quantity.</p>
      <div>
        <h3>Reviewing discrepancies</h3>
        <p>Each row shows the <strong>system quantity</strong>, your <strong>counted quantity</strong>, and the <strong>difference</strong>. Large unexpected differences are worth recounting physically before committing.</p>
      </div>
      <div>
        <h3>Editing a count</h3>
        <p>To correct a counted quantity before committing, click the count value in the discrepancy report and update it.</p>
      </div>
      <div>
        <h3>Committing</h3>
        <p>Once satisfied, click <strong>Commit</strong>. Each discrepancy becomes an inventory adjustment in the movements log, tagged as a stocktake adjustment.</p>
      </div>
      <Callout type="warning">
        Once committed, discrepancies cannot be reversed. If you discover an error after committing, record a manual adjustment to correct the specific component.
      </Callout>
    </ArticleLayout>
  );
}
