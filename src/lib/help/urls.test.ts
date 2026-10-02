import { describe, it, expect } from "vitest";
import { helpBaseUrl } from "./urls";

describe("helpBaseUrl", () => {
  it("uses the configured app URL without a trailing slash", () => {
    expect(helpBaseUrl("https://app.manuva.app/")).toBe("https://app.manuva.app");
  });
  it("falls back to the production app URL", () => {
    expect(helpBaseUrl(undefined)).toBe("https://app.manuva.app");
    expect(helpBaseUrl("")).toBe("https://app.manuva.app");
  });
});
