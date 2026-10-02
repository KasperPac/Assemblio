import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchHelp, type SearchSource } from "./search";

const sources: SearchSource[] = [
  {
    slug: "purchasing-and-xero",
    title: "Purchasing & Xero",
    description: "Raise purchase orders, receive goods, enter supplier invoices and send bills to Xero.",
    headings: [
      { text: "How it fits together", id: "how-it-fits-together" },
      { text: "Setting up Xero", id: "setting-up-xero" },
      { text: "Voiding and re-entering an invoice", id: "voiding-and-re-entering-an-invoice" },
    ],
  },
  {
    slug: "stocktake",
    title: "Stocktake",
    description: "Count your stock and commit the results.",
    headings: [{ text: "Running a stocktake", id: "running-a-stocktake" }],
  },
];
const entries = buildSearchIndex(sources);

describe("buildSearchIndex", () => {
  it("makes one entry per manual and one per section, with anchored links", () => {
    expect(entries).toHaveLength(6);
    expect(entries[0]).toEqual({
      href: "/help/purchasing-and-xero",
      title: "Purchasing & Xero",
      manualTitle: "Purchasing & Xero",
      description: sources[0].description,
      kind: "manual",
    });
    expect(entries[2]).toEqual({
      href: "/help/purchasing-and-xero#setting-up-xero",
      title: "Setting up Xero",
      manualTitle: "Purchasing & Xero",
      kind: "section",
    });
  });
});

describe("searchHelp", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(searchHelp(entries, "")).toEqual([]);
    expect(searchHelp(entries, "   ")).toEqual([]);
  });
  it("matches case-insensitively and lists manuals before sections", () => {
    const hits = searchHelp(entries, "XERO");
    expect(hits[0].kind).toBe("manual");
    expect(hits.map((h) => h.title)).toEqual(["Purchasing & Xero", "Setting up Xero"]);
  });
  it("does not return every section of a manual just because the manual title matches", () => {
    expect(searchHelp(entries, "xero").map((h) => h.title)).not.toContain("How it fits together");
  });
  it("matches a section by its own words plus its manual's title", () => {
    expect(searchHelp(entries, "xero void").map((h) => h.href)).toEqual([
      "/help/purchasing-and-xero#voiding-and-re-entering-an-invoice",
    ]);
  });
  it("treats regex metacharacters as plain text", () => {
    expect(() => searchHelp(entries, "c++ (")).not.toThrow();
    expect(searchHelp(entries, "c++ (")).toEqual([]);
  });
  it("caps the number of results", () => {
    expect(searchHelp(entries, "a", 2)).toHaveLength(2);
  });
});
