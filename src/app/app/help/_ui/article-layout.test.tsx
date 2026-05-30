import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ArticleLayout from "./article-layout";

describe("ArticleLayout", () => {
  it("renders the title", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Recording an inventory adjustment" description="Fix stock counts." category="inventory">
        <p>Content here</p>
      </ArticleLayout>
    );
    expect(html).toContain("Recording an inventory adjustment");
  });

  it("renders the description", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Fix stock counts." category="inventory">
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).toContain("Fix stock counts.");
  });

  it("renders children", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory">
        <p>Article body text</p>
      </ArticleLayout>
    );
    expect(html).toContain("Article body text");
  });

  it("renders a Help breadcrumb link", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory">
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).toContain('href="/app/help"');
    expect(html).toContain("Help");
  });

  it("renders RelatedArticles when relatedSlugs provided", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory" relatedSlugs={["inventory/movements"]}>
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).toContain("Inventory movements log");
  });

  it("omits RelatedArticles when no relatedSlugs", () => {
    const html = renderToStaticMarkup(
      <ArticleLayout title="Title" description="Desc" category="inventory">
        <p>Body</p>
      </ArticleLayout>
    );
    expect(html).not.toContain("Related articles");
  });
});
