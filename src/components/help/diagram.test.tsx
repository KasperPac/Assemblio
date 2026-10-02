import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./diagrams", () => ({
  DIAGRAMS: { demo: () => <svg role="img" aria-label="Demo flow" /> },
}));

import { Diagram } from "./diagram";

describe("Diagram", () => {
  it("renders the named drawing in a figure with its caption", () => {
    const html = renderToStaticMarkup(<Diagram name="demo" caption="Purchase to payment" />);
    expect(html).toContain("<figure");
    expect(html).toContain('aria-label="Demo flow"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("Purchase to payment");
  });
  it("fails loudly on an unknown drawing", () => {
    expect(() => renderToStaticMarkup(<Diagram name="missing" caption="x" />)).toThrow('Unknown help diagram "missing"');
  });
});
