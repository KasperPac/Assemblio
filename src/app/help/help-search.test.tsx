import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HelpSearch from "./help-search";

describe("HelpSearch", () => {
  it("renders a labelled search box and no results before anything is typed", () => {
    const html = renderToStaticMarkup(
      <HelpSearch entries={[{ href: "/help/stocktake", title: "Stocktake", manualTitle: "Stocktake", kind: "manual" }]} />,
    );
    expect(html).toContain('<label for="help-search"');
    expect(html).toContain('type="search"');
    expect(html).not.toContain("/help/stocktake");
  });
});
