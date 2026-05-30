import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function AdjustmentsPage() {
  return (
    <ArticleLayout
      title="Recording an inventory adjustment"
      description="Correct on-hand quantities when physical counts differ from the system."
      category="inventory"
      relatedSlugs={["inventory/movements", "stocktake/running-a-stocktake"]}
    >
      <p>
        Use an inventory adjustment when you need to correct a component&apos;s on-hand quantity
        outside of a stocktake — for example, to account for damaged stock, a data entry error,
        or stock received without a purchase order.
      </p>
      <Steps>
        <Step>Open <strong>Inventory</strong> in the sidebar.</Step>
        <Step>Find the component you want to adjust. Use the search bar or scroll the list.</Step>
        <Step>Click the component row to open its detail view, then click <strong>Log movement</strong>.</Step>
        <Step>
          Select a <strong>reason code</strong>:
          <ul style={{ marginTop: 6, paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Received</strong> — stock that arrived outside a PO</li>
            <li><strong>Consumed</strong> — used in production without a formal order</li>
            <li><strong>Damaged</strong> — stock written off</li>
            <li><strong>Correction</strong> — fixing a data entry error</li>
            <li><strong>Transfer</strong> — moving stock between locations</li>
          </ul>
        </Step>
        <Step>Enter the quantity delta. Use a <strong>positive number</strong> to add stock, a <strong>negative number</strong> to remove it.</Step>
        <Step>Optionally, add a note explaining the reason.</Step>
        <Step>Click <strong>Submit</strong>. The adjustment appears immediately in the movements log.</Step>
      </Steps>
      <Callout type="tip">
        For large-scale corrections after a physical count, use a <strong>Stocktake session</strong> instead — it gives you a full discrepancy report before any adjustments are committed.
      </Callout>
    </ArticleLayout>
  );
}
