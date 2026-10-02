import { describe, it, expect } from "vitest";
import sitemap from "./sitemap";
import { MANUALS } from "@/content/help/manuals";
import { helpBaseUrl } from "@/lib/help/urls";

describe("sitemap", () => {
  it("lists the help index and every published manual", () => {
    const urls = sitemap().map((e) => e.url);
    const base = helpBaseUrl();
    expect(urls).toContain(`${base}/help`);
    for (const m of MANUALS) expect(urls).toContain(`${base}/help/${m.slug}`);
    expect(urls).toHaveLength(MANUALS.length + 1);
  });
});
