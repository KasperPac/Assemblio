import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function ComponentsPage() {
  return (
    <ArticleLayout
      title="Components vs products"
      description="Understand the difference between raw materials, sub-assemblies, and finished goods."
      category="bom"
      relatedSlugs={["bom/creating-a-bom", "inventory/adjustments"]}
    >
      <p>Manuva distinguishes between two types of items in your inventory:</p>
      <div>
        <h3>Components</h3>
        <p>Components are raw materials or sub-assemblies that go <em>into</em> a product. They are tracked by quantity in Inventory. Examples: aluminium sheet, M6 bolts, a printed circuit board.</p>
      </div>
      <div>
        <h3>Products</h3>
        <p>Products are finished goods that you sell. They are linked to your Shopify catalogue via SKU. A product has a BOM that defines which components are consumed to make it.</p>
      </div>
      <div>
        <h3>Sub-assemblies</h3>
        <p>A sub-assembly is a component that is itself made from other components. It has its own BOM and can appear as a line item in a parent BOM.</p>
      </div>
      <Callout type="tip">
        If you&apos;re unsure whether something should be a component or a product, ask: &quot;Do I sell this directly to a customer?&quot; If yes, it&apos;s a product. If it goes into something else first, it&apos;s a component.
      </Callout>
    </ArticleLayout>
  );
}
