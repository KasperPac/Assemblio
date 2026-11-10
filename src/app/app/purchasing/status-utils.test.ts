import { describe, expect, it } from "vitest";
import { getStatusLabel } from "./status-utils";

describe("getStatusLabel", () => {
  it("returns the human label for known statuses", () => {
    expect(getStatusLabel("open")).toBe("Open");
    expect(getStatusLabel("in_transit")).toBe("In Transit");
    expect(getStatusLabel("received")).toBe("Received");
    expect(getStatusLabel("cancelled")).toBe("Cancelled");
    expect(getStatusLabel("archived")).toBe("Archived");
  });
  it("falls back to the raw value for unknown statuses", () => {
    expect(getStatusLabel("weird_status")).toBe("weird_status");
    expect(getStatusLabel("toString")).toBe("toString");
  });
});
