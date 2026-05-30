import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CreatePurchaseOrderPage() {
  return (
    <ArticleLayout
      title="Create a purchase order"
      description="Raise a PO to a supplier and track it through to goods receipt."
      category="getting-started"
      relatedSlugs={["purchasing/purchase-orders", "purchasing/goods-inwards", "purchasing/suppliers"]}
    >
      <p>
        Purchase orders track what you&apos;re ordering from suppliers, at what price, and when you
        expect delivery. When stock arrives, you receive it against the PO so inventory levels update automatically.
      </p>
      <Steps>
        <Step>Open <strong>Purchasing</strong> in the sidebar and click <strong>New purchase order</strong>.</Step>
        <Step>Select the supplier. If the supplier doesn&apos;t exist yet, go to <strong>Suppliers</strong> and create them first.</Step>
        <Step>Add line items: search for a component, enter the quantity and unit price for each.</Step>
        <Step>Set the <strong>expected delivery date</strong>.</Step>
        <Step>Click <strong>Save</strong> to save as a draft, or <strong>Mark as sent</strong> if you&apos;ve already placed the order with the supplier.</Step>
        <Step>When goods arrive, open the PO and click <strong>Receive goods</strong> to record the receipt — see <em>Receiving goods inwards</em>.</Step>
      </Steps>
      <Callout type="tip">
        Check the <strong>Dashboard → Purchasing signals</strong> widget to see which components are running low and need reordering.
      </Callout>
    </ArticleLayout>
  );
}
