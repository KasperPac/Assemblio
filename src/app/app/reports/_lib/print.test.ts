import { describe, expect, it, vi } from "vitest";
import { printWithLightTheme, rangeLabel } from "./print";

function fakeRoot(theme: string | null) {
  const attrs = new Map<string, string>();
  if (theme) attrs.set("data-theme", theme);
  return {
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    theme: () => attrs.get("data-theme") ?? null,
  };
}

describe("printWithLightTheme", () => {
  it("forces the light theme while printing and restores dark afterwards", () => {
    const root = fakeRoot("dark");
    let seenDuringPrint: string | null = null;
    const print = vi.fn(() => {
      seenDuringPrint = root.theme();
    });
    printWithLightTheme(root, print);
    expect(print).toHaveBeenCalledOnce();
    expect(seenDuringPrint).toBe("light");
    expect(root.theme()).toBe("dark");
  });

  it("leaves an unset theme unset afterwards", () => {
    const root = fakeRoot(null);
    printWithLightTheme(root, () => {});
    expect(root.theme()).toBeNull();
  });

  it("restores the theme even when print throws", () => {
    const root = fakeRoot("dark");
    expect(() =>
      printWithLightTheme(root, () => {
        throw new Error("blocked");
      })
    ).toThrow("blocked");
    expect(root.theme()).toBe("dark");
  });
});

describe("rangeLabel", () => {
  it("formats an explicit from/to range", () => {
    expect(rangeLabel({ from: "2026-09-01", to: "2026-09-22" })).toBe("1 Sept 2026 – 22 Sept 2026");
  });

  it("says 'All time' when no range is set", () => {
    expect(rangeLabel({})).toBe("All time");
  });

  it("handles an open-ended range", () => {
    expect(rangeLabel({ from: "2026-09-01" })).toBe("From 1 Sept 2026");
    expect(rangeLabel({ to: "2026-09-22" })).toBe("Up to 22 Sept 2026");
  });
});
