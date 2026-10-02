import { afterEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Screenshot } from "./screenshot";

afterEach(() => vi.unstubAllEnvs());

describe("Screenshot", () => {
  it("renders nothing outside development while the image does not exist yet", () => {
    expect(renderToStaticMarkup(<Screenshot src="/help/stocktake/not-captured.png" alt="The count screen" />)).toBe("");
  });
  it("shows a labelled placeholder in development while the image does not exist yet", () => {
    vi.stubEnv("NODE_ENV", "development");
    const html = renderToStaticMarkup(<Screenshot src="/help/stocktake/not-captured.png" alt="The count screen" />);
    expect(html).toContain("Screenshot to come: The count screen");
  });
  it("only accepts PNGs under /help/", () => {
    expect(() => renderToStaticMarkup(<Screenshot src="/logo.png" alt="x" />)).toThrow("/help/<manual>/<name>.png");
    expect(() => renderToStaticMarkup(<Screenshot src="/help/a/b.jpg" alt="x" />)).toThrow("/help/<manual>/<name>.png");
  });
});
