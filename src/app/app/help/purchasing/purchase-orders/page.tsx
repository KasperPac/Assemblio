import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function PurchaseOrdersPage() {
  return (
    <ArticleLayout
      title="Creating a purchase order"
      description="Raise a PO, set quantities and prices, and send it to a supplier."
      category="purchasing"
      relatedSlugs={["purchasing/goods-inwards", "purchasing/suppliers"]}
    >
      <Steps>
        <Step>Open <strong>Purchasing</strong> in the sidebar and click <strong>New purchase order</strong>.</Step>
        <Step>Select the <strong>supplier</strong>. Only suppliers you have already created appear in this list.</Step>
        <Step>Click <strong>Add line item</strong>. Search for a component, enter the <strong>quantity</strong> and <strong>unit price</strong>.</Step>
        <Step>Add more line items as needed.</Step>
        <Step>Set the <strong>expected delivery date</strong>.</Step>
        <Step>Click <strong>Save as draft</strong> to save without committing, or <strong>Mark as sent</strong> if the order has already been placed with the supplier.</Step>
      </Steps>
      <Callout type="tip">
        You can generate a PO directly from the <strong>Dashboard → Purchasing signals</strong> widget, which pre-fills components that are below their reorder point.
      </Callout>
      <Callout type="info">
        Manuva does not send the PO to the supplier automatically. You need to export it as a PDF or communicate with the supplier directly.
      </Callout>
    </ArticleLayout>
  );
}
