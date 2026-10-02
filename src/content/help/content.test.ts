import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { MANUALS } from "./manuals";

// content.ts imports .mdx files, which vitest does not compile, so it is checked as text.
const source = readFileSync(path.join(process.cwd(), "src/content/help/content.ts"), "utf8");

describe("manual content loaders", () => {
  it("has a loader for every published manual, importing its own file", () => {
    for (const { slug } of MANUALS) {
      expect(source, slug).toContain(`"${slug}": () => import("./${slug}.mdx")`);
    }
  });
});
