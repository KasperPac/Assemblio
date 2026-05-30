import ArticleLayout from "../../_ui/article-layout";
import { Steps, Step } from "../../_ui/steps";
import { Callout } from "../../_ui/callout";

export default function CreatingABomPage() {
  return (
    <ArticleLayout
      title="Creating a bill of materials"
      description="Define the components, quantities, and assembly steps for a product."
      category="bom"
      relatedSlugs={["bom/components", "bom/versions", "bom/allocation"]}
    >
      <p>
        A BOM lists every component needed to produce one unit of a finished product, along with
        the quantity of each. Manuva uses this to calculate material requirements, allocate stock
        to orders, and flag shortages before production starts.
      </p>
      <Steps>
        <Step>Open <strong>BOMs</strong> in the sidebar and click <strong>New BOM</strong>.</Step>
        <Step>Search for and select the <strong>product</strong> this BOM is for.</Step>
        <Step>Click <strong>Add component</strong>. Search for the component by name or code and enter the quantity per unit.</Step>
        <Step>Repeat for each component. There is no limit to the number of components.</Step>
        <Step>Click <strong>Save</strong>. The BOM is saved as version 1 and activated automatically.</Step>
      </Steps>
      <Callout type="info">
        Components can themselves be finished sub-assemblies with their own BOMs. Manuva supports nested BOMs for multi-stage manufacturing.
      </Callout>
    </ArticleLayout>
  );
}
