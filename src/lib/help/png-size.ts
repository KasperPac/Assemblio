const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(buf: Uint8Array): { width: number; height: number } {
  if (buf.length < 24 || PNG_SIGNATURE.some((byte, i) => buf[i] !== byte)) throw new Error("Not a PNG file");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
