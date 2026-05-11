import { describe, expect, it } from "vitest";
import { LimitExceededError, computeLimit } from "./limits";

describe("computeLimit", () => {
  it("returns starter limits", () => {
    expect(computeLimit("starter", "locations")).toBe(1);
    expect(computeLimit("starter", "users")).toBe(3);
  });

  it("returns Infinity for unlimited users on growth", () => {
    expect(computeLimit("growth", "users")).toBe(Infinity);
  });

  it("returns Infinity for both kinds on pro and enterprise", () => {
    expect(computeLimit("pro", "locations")).toBe(Infinity);
    expect(computeLimit("pro", "users")).toBe(Infinity);
    expect(computeLimit("enterprise", "locations")).toBe(Infinity);
    expect(computeLimit("enterprise", "users")).toBe(Infinity);
  });
});

describe("LimitExceededError", () => {
  it("carries kind, limit, current, tier", () => {
    const e = new LimitExceededError("locations", 1, 5, "starter");
    expect(e.kind).toBe("locations");
    expect(e.limit).toBe(1);
    expect(e.current).toBe(5);
    expect(e.tier).toBe("starter");
    expect(e.message).toContain("locations");
    expect(e.message).toContain("starter");
    expect(e.name).toBe("LimitExceededError");
  });

  it("is an instance of Error", () => {
    expect(new LimitExceededError("users", 3, 4, "starter")).toBeInstanceOf(Error);
  });
});
