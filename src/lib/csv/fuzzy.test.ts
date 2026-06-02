import { describe, it, expect } from "vitest";
import { bestMatch } from "./fuzzy";

describe("bestMatch", () => {
  it("returns null for empty candidates", () => {
    expect(bestMatch("Bunnings", [])).toBeNull();
  });

  it("returns the candidate on exact match", () => {
    expect(bestMatch("Bunnings", ["Bunnings", "RS Components"])).toBe("Bunnings");
  });

  it("returns the candidate on exact match case-insensitively", () => {
    expect(bestMatch("bunnings", ["Bunnings"])).toBe("Bunnings");
  });

  it("matches a 1-edit typo (missing letter) — 'Bunnigs' → 'Bunnings'", () => {
    expect(bestMatch("Bunnigs", ["Bunnings", "RS Components"])).toBe("Bunnings");
  });

  it("matches a 2-edit typo — 'Bunigs' → 'Bunnings'", () => {
    expect(bestMatch("Bunigs", ["Bunnings"])).toBe("Bunnings");
  });

  it("matches 'Electonics' → 'Electronics' (1 edit)", () => {
    expect(bestMatch("Electonics", ["Electronics", "Fasteners"])).toBe("Electronics");
  });

  it("returns null when distance exceeds 2 — 'Bung' → 'Bunnings' (4 edits)", () => {
    expect(bestMatch("Bung", ["Bunnings"])).toBeNull();
  });

  it("returns null when ratio exceeds 30% — short word with 2 edits", () => {
    expect(bestMatch("ab", ["xz"])).toBeNull();
  });

  it("returns null when input is completely unrelated", () => {
    expect(bestMatch("xyz123", ["Bunnings", "RS Components"])).toBeNull();
  });

  it("returns the closest of multiple candidates", () => {
    expect(bestMatch("Bunnigs", ["RS Components", "Bunnings"])).toBe("Bunnings");
  });

  it("is case-insensitive on both sides", () => {
    expect(bestMatch("BUNNIGS", ["bunnings"])).toBe("bunnings");
  });
});
