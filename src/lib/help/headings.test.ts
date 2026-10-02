import { describe, it, expect } from "vitest";
import { slugify, extractHeadings } from "./headings";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Entering a supplier invoice")).toBe("entering-a-supplier-invoice");
  });
  it("spells an ampersand as 'and'", () => {
    expect(slugify("Products & BOMs")).toBe("products-and-boms");
  });
  it("drops apostrophes and trailing punctuation", () => {
    expect(slugify("What's a BOM version?")).toBe("whats-a-bom-version");
    expect(slugify("Why can't I see the Xero card?")).toBe("why-cant-i-see-the-xero-card");
  });
  it("trims and collapses separators", () => {
    expect(slugify("  Statuses   explained -- ")).toBe("statuses-explained");
  });
});

describe("extractHeadings", () => {
  it("returns the ## headings in order with their ids", () => {
    const source = "Lead.\n\n## How it fits together\n\nText.\n\n## Products & BOMs\n";
    expect(extractHeadings(source)).toEqual([
      { text: "How it fits together", id: "how-it-fits-together" },
      { text: "Products & BOMs", id: "products-and-boms" },
    ]);
  });
  it("ignores h1, h3 and headings inside fenced code", () => {
    const source = "# Title\n\n### Detail\n\n```md\n## Not a heading\n```\n\n## Real\n";
    expect(extractHeadings(source)).toEqual([{ text: "Real", id: "real" }]);
  });
  it("handles CRLF line endings and closing hashes", () => {
    expect(extractHeadings("## One ##\r\n\r\n## Two\r\n").map((h) => h.id)).toEqual(["one", "two"]);
  });
});
