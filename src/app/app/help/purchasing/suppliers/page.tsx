import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function SuppliersPage() {
  return (
    <ArticleLayout
      title="Managing suppliers"
      description="Add suppliers, set lead times, and link them to components."
      category="purchasing"
      relatedSlugs={["purchasing/purchase-orders"]}
    >
      <Steps>
        <Step>Open <strong>Suppliers</strong> in the sidebar and click <strong>New supplier</strong>.</Step>
        <Step>Enter the supplier name, contact email, and phone number.</Step>
        <Step>Set the <strong>default lead time</strong> in days.</Step>
        <Step>Click <strong>Save</strong>.</Step>
        <Step>To link components to this supplier, open a component from <strong>Inventory</strong>, go to the <strong>Suppliers</strong> tab, and add the supplier with the agreed unit price and lead time.</Step>
      </Steps>
      <Callout type="tip">
        Setting accurate lead times is important — the <strong>Purchasing signals</strong> widget uses them to warn you when to reorder based on current stock and demand.
      </Callout>
    </ArticleLayout>
  );
}
