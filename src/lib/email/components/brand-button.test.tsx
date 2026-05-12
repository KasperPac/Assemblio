import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandButton } from "./brand-button";

describe("BrandButton", () => {
  it("renders an anchor with the given href and label", () => {
    const html = renderToStaticMarkup(
      <BrandButton href="https://example.com/accept">
        Accept invitation
      </BrandButton>
    );
    expect(html).toContain('href="https://example.com/accept"');
    expect(html).toContain("Accept invitation");
  });

  it("applies the brand background color", () => {
    const html = renderToStaticMarkup(
      <BrandButton href="https://example.com">Go</BrandButton>
    );
    // Brand color from tokens
    expect(html.toLowerCase()).toContain("#6366f1");
  });
});
