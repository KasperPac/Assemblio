import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HelpLink from "./help-link";

describe("HelpLink", () => {
  it("builds the correct href from slug", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" />);
    expect(html).toContain('href="/app/help/inventory/adjustments"');
  });

  it("renders the info icon", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" />);
    expect(html).toContain("ⓘ");
  });

  it("renders a label when provided", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" label="How do adjustments work?" />);
    expect(html).toContain("How do adjustments work?");
  });

  it("renders no label text when label is omitted", () => {
    const html = renderToStaticMarkup(<HelpLink slug="inventory/adjustments" />);
    expect(html).not.toContain("How do");
  });
});
