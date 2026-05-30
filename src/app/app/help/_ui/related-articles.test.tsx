import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RelatedArticles } from "./related-articles";

describe("RelatedArticles", () => {
  it("renders links for known slugs", () => {
    const html = renderToStaticMarkup(
      <RelatedArticles slugs={["inventory/adjustments", "stocktake/running-a-stocktake"]} />
    );
    expect(html).toContain("Recording an inventory adjustment");
    expect(html).toContain("Running a stocktake");
    expect(html).toContain('href="/app/help/inventory/adjustments"');
  });

  it("silently skips unknown slugs", () => {
    const html = renderToStaticMarkup(
      <RelatedArticles slugs={["inventory/adjustments", "does/not-exist"]} />
    );
    expect(html).toContain("Recording an inventory adjustment");
    expect(html).not.toContain("does/not-exist");
  });

  it("renders nothing when all slugs are unknown", () => {
    const html = renderToStaticMarkup(<RelatedArticles slugs={["does/not-exist"]} />);
    expect(html).toBe("");
  });

  it("renders nothing for empty slugs array", () => {
    const html = renderToStaticMarkup(<RelatedArticles slugs={[]} />);
    expect(html).toBe("");
  });
});
