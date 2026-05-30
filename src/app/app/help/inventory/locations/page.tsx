import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function LocationsPage() {
  return (
    <ArticleLayout
      title="Bin locations and warehouse"
      description="Organise stock across warehouses, zones, and bin locations."
      category="inventory"
      relatedSlugs={["inventory/adjustments", "stocktake/running-a-stocktake"]}
    >
      <p>
        Manuva supports a three-level location hierarchy: <strong>Warehouse → Zone → Bin</strong>.
        You can track exactly where each component is stored and record movements between locations.
      </p>
      <Steps>
        <Step>Open <strong>Warehouse</strong> in the sidebar.</Step>
        <Step>Click <strong>New location</strong> and create your top-level warehouse (e.g. &quot;Main Warehouse&quot;).</Step>
        <Step>Add zones within the warehouse (e.g. &quot;Shelf A&quot;, &quot;Freezer&quot;, &quot;Dispatch Bay&quot;).</Step>
        <Step>Add bins within zones (e.g. &quot;A-01&quot;, &quot;A-02&quot;).</Step>
        <Step>Assign a default bin to each component from the component detail page.</Step>
      </Steps>
      <Callout type="tip">
        You can print barcode labels for bins directly from the Warehouse page. Scanning a bin barcode on the stocktake screen automatically selects the correct location.
      </Callout>
      <Callout type="info">
        Location tracking is optional. If you don&apos;t set up bins, stock is tracked at the warehouse level only.
      </Callout>
    </ArticleLayout>
  );
}
