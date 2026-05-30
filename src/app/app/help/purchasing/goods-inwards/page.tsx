import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function GoodsInwardsPage() {
  return (
    <ArticleLayout
      title="Receiving goods inwards"
      description="Record stock receipt against a purchase order."
      category="purchasing"
      relatedSlugs={["purchasing/purchase-orders", "inventory/movements"]}
    >
      <p>When stock arrives from a supplier, record it in Goods Inwards to update your inventory levels and mark the PO as received.</p>
      <Steps>
        <Step>Open <strong>Goods Inwards</strong> in the sidebar. You will see all open purchase orders.</Step>
        <Step>Find the relevant PO and click <strong>Receive goods</strong>.</Step>
        <Step>For each line item, enter the <strong>quantity received</strong>. This can be less than ordered for partial deliveries.</Step>
        <Step>Click <strong>Confirm receipt</strong>. Inventory levels update immediately.</Step>
      </Steps>
      <Callout type="info">
        If you receive less than the ordered quantity, the PO remains open and shows as partially received.
      </Callout>
      <Callout type="warning">
        Receipt is recorded immediately and cannot be undone. If you entered the wrong quantity, record a manual inventory adjustment to correct the difference.
      </Callout>
    </ArticleLayout>
  );
}
