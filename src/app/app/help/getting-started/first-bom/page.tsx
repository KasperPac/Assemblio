import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function FirstBomPage() {
  return (
    <ArticleLayout
      title="Set up your first BOM"
      description="Create a bill of materials from scratch and link it to a product."
      category="getting-started"
      relatedSlugs={["bom/creating-a-bom", "bom/components", "bom/allocation"]}
    >
      <p>
        A bill of materials (BOM) defines exactly which components — and how many of each — are
        required to make one unit of a finished product. Once a BOM is active, Manuva uses it to
        calculate stock requirements and allocate inventory against orders.
      </p>
      <Steps>
        <Step>Open <strong>BOMs</strong> in the sidebar.</Step>
        <Step>Click <strong>New BOM</strong> in the top-right corner.</Step>
        <Step>Search for and select the product this BOM is for. Each product can have one active BOM at a time.</Step>
        <Step>Add component rows. For each row: search for the component by name or code, then enter the quantity required per unit of finished product.</Step>
        <Step>Click <strong>Add component</strong> to add more rows as needed.</Step>
        <Step>Click <strong>Save</strong>. The BOM is saved as version 1 and set as active automatically.</Step>
      </Steps>
      <Callout type="tip">
        If a component doesn&apos;t exist yet, go to <strong>Inventory → Components</strong> and create it first, then return here to add it to the BOM.
      </Callout>
      <Callout type="info">
        You can have multiple BOM versions for the same product — useful when a design changes but you need to keep the history. Only the active version is used for new production orders.
      </Callout>
    </ArticleLayout>
  );
}
