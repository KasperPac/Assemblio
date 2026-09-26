// Shopify returns "" for a variant with no barcode. Stored as-is, every
// barcode-less variant would share the value "" and the Square matcher
// (MANUVA-27 plan 2) would treat them as matches.
export function normaliseBarcode(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
