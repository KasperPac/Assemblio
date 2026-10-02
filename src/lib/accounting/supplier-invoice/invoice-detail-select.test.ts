import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The detail page's row is loosely typed, so tsc cannot catch a field the void wording reads but the select omits.
describe("supplier invoice detail page select", () => {
  it("selects external_id, which decides the void dialog wording", () => {
    const src = readFileSync("src/app/app/purchasing/invoices/[id]/page.tsx", "utf8");
    const select = /\.from\("supplier_invoice"\)\s*\.select\("([^"]+)"\)/.exec(src)?.[1] ?? "";
    expect(select).toMatch(/\bexternal_id\b/);
  });
});
