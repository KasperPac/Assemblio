import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import * as runtime from "react/jsx-runtime";
import { evaluate, type EvaluateOptions } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { extractHeadings } from "@/lib/help/headings";
import { helpMdxComponents } from "@/components/help/mdx-map";
import { MANUALS } from "./manuals";

const jsx = runtime as unknown as Pick<EvaluateOptions, "Fragment" | "jsx" | "jsxs">;
const read = (slug: string) => readFileSync(path.join(process.cwd(), "src/content/help", `${slug}.mdx`), "utf8");

describe("published manuals", () => {
  it("are listed in the registry", () => {
    expect(Array.isArray(MANUALS)).toBe(true);
  });

  for (const { slug } of MANUALS) {
    describe(slug, () => {
      const source = read(slug);

      it("has no import/export lines and no h1", () => {
        expect(source).not.toMatch(/^(import|export)\s/m);
        expect(source).not.toMatch(/^#\s/m);
      });

      it("opens with How it fits together, and its headings are plain and unique", () => {
        const headings = extractHeadings(source);
        expect(headings[0]?.text).toBe("How it fits together");
        for (const h of headings) expect(h.text).toMatch(/^[^`*_[\]<>{}]+$/);
        expect(new Set(headings.map((h) => h.id)).size).toBe(headings.length);
      });

      it("renders with the help components, every h2 carrying its contents-list anchor", async () => {
        const { default: Content } = await evaluate(source, { ...jsx, remarkPlugins: [remarkGfm] });
        const html = renderToStaticMarkup(<Content components={helpMdxComponents} />);
        const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual(extractHeadings(source).map((h) => h.id));
      });
    });
  }
});
