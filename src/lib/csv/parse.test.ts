import { describe, it, expect } from "vitest";
import { parseCSVLine, parseCSV } from "./parse";

describe("parseCSVLine", () => {
  it("splits a simple comma-separated line", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around values", () => {
    expect(parseCSVLine(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCSVLine('"a,b",c')).toEqual(["a,b", "c"]);
  });

  it("handles escaped double-quotes inside a quoted field", () => {
    expect(parseCSVLine('"he said ""hi"""')).toEqual(['he said "hi"']);
  });

  it("returns a single-element array for a line with no commas", () => {
    expect(parseCSVLine("hello")).toEqual(["hello"]);
  });

  it("preserves leading/trailing whitespace inside a quoted field", () => {
    expect(parseCSVLine('" hello "')).toEqual([" hello "]);
  });
});

describe("parseCSV", () => {
  it("returns empty array for a header-only string", () => {
    expect(parseCSV("name,sku")).toEqual([]);
  });

  it("parses rows keyed by header", () => {
    const result = parseCSV("name,sku\nBolt,BOLT-01");
    expect(result).toEqual([{ name: "Bolt", sku: "BOLT-01" }]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCSV("name,sku\r\nBolt,BOLT-01");
    expect(result).toEqual([{ name: "Bolt", sku: "BOLT-01" }]);
  });

  it("skips blank lines", () => {
    const result = parseCSV("name,sku\nBolt,BOLT-01\n\nGasket,GSKT-01");
    expect(result).toHaveLength(2);
  });

  it("defaults missing columns to empty string", () => {
    const result = parseCSV("name,sku,unit\nBolt,BOLT-01");
    expect(result[0].unit).toBe("");
  });

  it("returns empty array for an empty string", () => {
    expect(parseCSV("")).toEqual([]);
  });
});
