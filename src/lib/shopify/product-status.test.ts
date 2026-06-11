import { describe, expect, it } from "vitest";
import { mapProductStatus } from "./product-status";

describe("mapProductStatus", () => {
  it("maps ACTIVE to active", () => {
    expect(mapProductStatus("ACTIVE")).toBe("active");
  });

  it("maps DRAFT to draft", () => {
    expect(mapProductStatus("DRAFT")).toBe("draft");
  });

  it("maps ARCHIVED to archived", () => {
    expect(mapProductStatus("ARCHIVED")).toBe("archived");
  });

  it("is case-insensitive", () => {
    expect(mapProductStatus("draft")).toBe("draft");
  });

  it("defaults unknown values to active", () => {
    expect(mapProductStatus("SOMETHING_NEW")).toBe("active");
  });

  it("defaults null/undefined to active", () => {
    expect(mapProductStatus(null)).toBe("active");
    expect(mapProductStatus(undefined)).toBe("active");
  });
});
