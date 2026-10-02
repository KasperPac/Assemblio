import { describe, it, expect } from "vitest";
import { pngSize } from "./png-size";

function pngHeader(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buf;
}

describe("pngSize", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(pngSize(pngHeader(2880, 1800))).toEqual({ width: 2880, height: 1800 });
  });
  it("rejects anything that is not a PNG", () => {
    expect(() => pngSize(new Uint8Array(24))).toThrow("Not a PNG file");
    expect(() => pngSize(new Uint8Array(4))).toThrow("Not a PNG file");
  });
});
