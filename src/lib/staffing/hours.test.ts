import { describe, expect, it } from "vitest";
import {
  netAvailableHours,
  parseCheckbox,
  parseHours,
  parseNullableHours,
} from "./hours";

describe("net available hours", () => {
  it("subtracts time booked away and adds overtime", () => {
    // 38 contracted, 8 leave, 2 training, 1 non-productive, 4 overtime
    expect(netAvailableHours(38, 8, 2, 1, 4)).toBe(31);
  });

  it("returns the contract when nothing is booked away", () => {
    expect(netAvailableHours(38, 0, 0, 0, 0)).toBe(38);
  });

  it("does not clamp at zero — over-booked time must stay visible", () => {
    expect(netAvailableHours(38, 40, 0, 0, 0)).toBe(-2);
  });
});

describe("staffing form parsing", () => {
  it("parses a numeric field", () => {
    expect(parseHours("38")).toBe(38);
    expect(parseHours("7.5")).toBe(7.5);
    expect(parseHours("0")).toBe(0);
  });

  it("falls back when blank, whitespace or missing", () => {
    expect(parseHours("", 38)).toBe(38);
    expect(parseHours("   ", 38)).toBe(38);
    expect(parseHours(null, 38)).toBe(38);
  });

  it("falls back rather than writing NaN or Infinity into the week", () => {
    expect(parseHours("abc", 38)).toBe(38);
    expect(parseHours("Infinity", 38)).toBe(38);
  });

  it("defaults to zero when no fallback is given", () => {
    expect(parseHours(null)).toBe(0);
    expect(parseHours("nonsense")).toBe(0);
  });

  it("distinguishes 'not set' from zero for nullable fields", () => {
    expect(parseNullableHours("0")).toBe(0);
    expect(parseNullableHours("")).toBeNull();
    expect(parseNullableHours(null)).toBeNull();
    expect(parseNullableHours("abc")).toBeNull();
  });

  it("reads a checkbox as on/off", () => {
    expect(parseCheckbox("on")).toBe(true);
    expect(parseCheckbox(null)).toBe(false);
    expect(parseCheckbox("true")).toBe(false);
  });
});
