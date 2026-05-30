import ArticleLayout from "../../_ui/article-layout";
import { Callout } from "../../_ui/callout";

export default function VersionsPage() {
  return (
    <ArticleLayout
      title="BOM versions"
      description="Manage design changes by creating new BOM versions without losing history."
      category="bom"
      relatedSlugs={["bom/creating-a-bom", "bom/allocation"]}
    >
      <p>
        Every time you edit a BOM, Manuva creates a new version rather than overwriting the
        existing one. This gives you a complete history of how a product&apos;s recipe has changed over time.
      </p>
      <div>
        <h3>Active version</h3>
        <p>Only one version is active at a time. The active version is used when allocating stock to new orders and when creating production orders. Previous versions are preserved for reference.</p>
      </div>
      <div>
        <h3>Creating a new version</h3>
        <p>Open a BOM and click <strong>Edit</strong>. Make your changes and click <strong>Save as new version</strong>. The new version is saved and set as active.</p>
      </div>
      <div>
        <h3>Comparing versions</h3>
        <p>In the BOM versions tab, select two versions to see a side-by-side diff showing which components were added, removed, or had their quantities changed.</p>
      </div>
      <Callout type="info">
        Orders created against an older BOM version retain their original material requirements. Activating a new version only affects orders created after the change.
      </Callout>
    </ArticleLayout>
  );
}
