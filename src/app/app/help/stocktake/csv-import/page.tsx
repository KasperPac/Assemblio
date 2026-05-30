import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CsvImportPage() {
  return (
    <ArticleLayout
      title="Importing counts via CSV"
      description="Upload a spreadsheet of counts instead of entering them one by one."
      category="stocktake"
      relatedSlugs={["stocktake/running-a-stocktake", "stocktake/resolving-discrepancies"]}
    >
      <p>If you count stock using a spreadsheet or a barcode scanner that outputs CSV, you can import the counts directly into a stocktake session.</p>
      <Steps>
        <Step>Start or open a stocktake session.</Step>
        <Step>Click <strong>Import CSV</strong>.</Step>
        <Step>Download the <strong>CSV template</strong> if you don&apos;t already have one in the correct format.</Step>
        <Step>Fill in the template: one row per component, with the component code and counted quantity.</Step>
        <Step>Upload the completed CSV file.</Step>
        <Step>Manuva imports the counts and pre-fills the session. Review for any unrecognised component codes.</Step>
        <Step>Continue as normal — submit to see discrepancies, then commit when ready.</Step>
      </Steps>
      <Callout type="info">
        The CSV template uses <strong>component codes</strong> (not names) to identify items. Make sure your scanner or spreadsheet outputs the same codes used in Manuva.
      </Callout>
    </ArticleLayout>
  );
}
