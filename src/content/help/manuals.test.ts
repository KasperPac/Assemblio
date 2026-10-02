import { existsSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { ALL_MANUAL_SLUGS, MANUALS, findManual } from "./manuals";

const dir = path.join(process.cwd(), "src/content/help");

describe("help manual registry", () => {
  it("lists each manual once, in ALL_MANUAL_SLUGS order", () => {
    const slugs = MANUALS.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(ALL_MANUAL_SLUGS.filter((s) => slugs.includes(s)));
  });
  it("has an MDX file for every listed manual", () => {
    for (const m of MANUALS) expect(existsSync(path.join(dir, `${m.slug}.mdx`)), m.slug).toBe(true);
  });
  it("gives every manual a title and a one-sentence description", () => {
    for (const m of MANUALS) {
      expect(m.title.trim(), m.slug).not.toBe("");
      expect(m.description.trim(), m.slug).toMatch(/^[A-Z].*\.$/);
    }
  });
  it("finds a manual by slug, and nothing for an unknown slug", () => {
    expect(findManual("not-a-manual")).toBeUndefined();
    for (const m of MANUALS) expect(findManual(m.slug)).toBe(m);
  });
});
