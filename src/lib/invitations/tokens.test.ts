import { describe, expect, it } from "vitest";
import { generateToken } from "./tokens";

describe("generateToken", () => {
  it("returns a base64url string at least 40 chars long", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("returns a unique value on every call", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      set.add(generateToken());
    }
    expect(set.size).toBe(1000);
  });
});
