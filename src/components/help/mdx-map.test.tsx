import { describe, it, expect } from "vitest";
import * as runtime from "react/jsx-runtime";
import { evaluate, type EvaluateOptions } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { extractHeadings } from "@/lib/help/headings";
import { helpMdxComponents, textContent } from "./mdx-map";

const jsx = runtime as unknown as Pick<EvaluateOptions, "Fragment" | "jsx" | "jsxs">;

async function render(source: string): Promise<string> {
  const { default: Content } = await evaluate(source, { ...jsx, remarkPlugins: [remarkGfm] });
  return renderToStaticMarkup(<Content components={helpMdxComponents} />);
}

describe("textContent", () => {
  it("flattens strings, numbers, arrays and elements", () => {
    expect(textContent(["Step ", 2, <strong key="s">now</strong>])).toBe("Step 2now");
    expect(textContent(null)).toBe("");
  });
});

describe("helpMdxComponents", () => {
  const source = [
    "Lead paragraph.",
    "",
    "## Products & BOMs",
    "",
    "1. Open **Products**.",
    "2. Click **New product**.",
    "",
    "## What's a draft?",
    "",
    "| Status | Meaning |",
    "| --- | --- |",
    "| Draft | Saved, not posted. |",
    "",
    '<Callout type="warning">Posting can\'t be undone.</Callout>',
  ].join("\n");

  it("gives every h2 the same id the contents list uses", async () => {
    const html = await render(source);
    const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(extractHeadings(source).map((h) => h.id));
    expect(ids).toEqual(["products-and-boms", "whats-a-draft"]);
  });
  it("renders GFM tables inside the shared table card", async () => {
    const html = await render(source);
    expect(html).toContain("<table");
    expect(html).toContain("<td>Draft</td>");
  });
  it("makes Callout available to manuals", async () => {
    expect(await render(source)).toContain("Posting can&#x27;t be undone.");
  });
});
