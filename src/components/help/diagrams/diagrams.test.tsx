import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DIAGRAMS } from "./index";

describe("help diagram registry", () => {
  it("is a map of drawings", () => {
    expect(typeof DIAGRAMS).toBe("object");
  });
  it.each(Object.entries(DIAGRAMS))("%s is an accessible SVG drawn only with design tokens", (_name, Drawing) => {
    const html = renderToStaticMarkup(<Drawing />);
    expect(html).toMatch(/^<svg[^>]*role="img"/);
    expect(html).toMatch(/aria-label="[^"]+"/);
    expect(html).not.toMatch(/(fill|stroke)="#/);
    expect(html).not.toMatch(/(fill|stroke)="(white|black|red|green|blue|gray|grey)"/);
  });
});
