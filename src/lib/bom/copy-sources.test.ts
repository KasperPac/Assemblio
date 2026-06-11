import { describe, expect, it } from "vitest";
import { pickBomPerVariant, variantLabel, type CopySourceBomRow } from "./copy-sources";

function row(overrides: Partial<CopySourceBomRow>): CopySourceBomRow {
  return {
    id: "bom-1",
    variant_id: "v1",
    version: 1,
    status: "draft",
    is_active: false,
    ...overrides,
  };
}

describe("pickBomPerVariant", () => {
  it("returns empty object for empty input", () => {
    expect(pickBomPerVariant([])).toEqual({});
  });

  it("prefers the active BOM even when a draft has a higher version", () => {
    const result = pickBomPerVariant([
      row({ id: "bom-active", version: 2, status: "active", is_active: true }),
      row({ id: "bom-draft", version: 3, status: "draft", is_active: false }),
    ]);
    expect(result).toEqual({ v1: { bomId: "bom-active", version: 2 } });
  });

  it("falls back to the highest non-archived version when nothing is active", () => {
    const result = pickBomPerVariant([
      row({ id: "bom-v1", version: 1 }),
      row({ id: "bom-v3", version: 3 }),
      row({ id: "bom-v2", version: 2 }),
    ]);
    expect(result).toEqual({ v1: { bomId: "bom-v3", version: 3 } });
  });

  it("ignores archived rows entirely", () => {
    const result = pickBomPerVariant([
      row({ id: "bom-arch", version: 5, status: "archived" }),
      row({ id: "bom-v2", version: 2 }),
    ]);
    expect(result).toEqual({ v1: { bomId: "bom-v2", version: 2 } });
  });

  it("excludes variants whose only BOMs are archived", () => {
    const result = pickBomPerVariant([
      row({ id: "bom-arch", version: 1, status: "archived" }),
      row({ id: "bom-other", variant_id: "v2", version: 1 }),
    ]);
    expect(result).toEqual({ v2: { bomId: "bom-other", version: 1 } });
  });

  it("handles multiple variants independently", () => {
    const result = pickBomPerVariant([
      row({ id: "a1", variant_id: "va", version: 1, status: "active", is_active: true }),
      row({ id: "a2", variant_id: "va", version: 2 }),
      row({ id: "b1", variant_id: "vb", version: 1 }),
      row({ id: "b2", variant_id: "vb", version: 2 }),
    ]);
    expect(result).toEqual({
      va: { bomId: "a1", version: 1 },
      vb: { bomId: "b2", version: 2 },
    });
  });
});

describe("variantLabel", () => {
  it("joins title and sku", () => {
    expect(variantLabel("Blue / Large", "WB-BL-L")).toBe("Blue / Large (WB-BL-L)");
  });

  it("omits missing sku", () => {
    expect(variantLabel("Blue / Large", null)).toBe("Blue / Large");
  });

  it("falls back for missing title", () => {
    expect(variantLabel(null, "SKU-1")).toBe("Untitled variant (SKU-1)");
    expect(variantLabel("  ", null)).toBe("Untitled variant");
  });
});
