import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function MovementsPage() {
  return (
    <ArticleLayout
      title="Inventory movements log"
      description="Understand how every stock change is tracked and audited."
      category="inventory"
      relatedSlugs={["inventory/adjustments", "stocktake/running-a-stocktake"]}
    >
      <p>
        The &quot;Inventory&quot; header shows &quot;Below reorder point&quot; as a count of distinct
        components flagged in the balance table. A component stocked in several locations counts
        once. The count compares each row&apos;s on-hand stock with its reorder point; it is not
        the number of units to buy. A dash means the count could not be loaded.
      </p>
      <p>
        Every time stock levels change — through an adjustment, a goods receipt, a production
        completion, or a stocktake commit — Manuva records a movement. The movements log is a
        complete, tamper-proof audit trail.
      </p>
      <div>
        <h3>Viewing movements</h3>
        <p>
          Open <strong>Inventory</strong>, select a component, and scroll to <strong>Recent movements</strong>.
          Each entry shows: date and time, movement type, quantity delta, reason code, and who recorded it.
        </p>
      </div>
      <div>
        <h3>Filtering and export</h3>
        <p>
          Use the date range filter to narrow the list. Click <strong>Export</strong> to download movements as a CSV for use in spreadsheets or accounting software.
        </p>
      </div>
      <Callout type="info">
        Movements cannot be deleted or edited after they are recorded. To correct an error, record a new adjustment with a negative delta and add a note explaining the correction.
      </Callout>
    </ArticleLayout>
  );
}
