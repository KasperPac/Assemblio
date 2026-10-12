export type RetailCandidate = { id: string; sku: string | null; barcode: string | null };
export type Mapping = { variant_id: string | null; status: "linked" | "unmatched" | "ambiguous" | "ignored"; match_method: "barcode" | "sku" | "manual" | null };

/** Do not guess between duplicate SKUs/barcodes or overwrite an operator's choice. */
export function matchSquareVariation(input: { sku?: string | null; barcode?: string | null }, candidates: RetailCandidate[], existing?: Mapping): Mapping {
  if (existing?.status === "linked" || existing?.status === "ignored") return existing;
  for (const key of ["sku", "barcode"] as const) {
    const value = input[key]?.trim();
    if (!value) continue;
    const hits = candidates.filter((candidate) => candidate[key]?.trim() === value);
    if (hits.length > 1) return { variant_id: null, status: "ambiguous", match_method: null };
    if (hits.length === 1) return { variant_id: hits[0].id, status: "linked", match_method: key };
  }
  return { variant_id: null, status: "unmatched", match_method: null };
}

export type CatalogObject = {
  id: string; type: string; is_deleted?: boolean; present_at_all_locations?: boolean;
  present_at_location_ids?: string[]; absent_at_location_ids?: string[];
  item_data?: { name?: string; product_type?: string; is_archived?: boolean; variations?: CatalogObject[] };
  item_variation_data?: { item_id?: string; name?: string; sku?: string; upc?: string; track_inventory?: boolean;
    location_overrides?: Array<{ location_id: string; track_inventory?: boolean }>;
    stockable_conversion?: { stockable_item_variation_id: string; stockable_quantity: string; nonstockable_quantity: string } };
};

export function trackedSquareLocations(item: CatalogObject | undefined, variation: CatalogObject, locations: string[]): string[] {
  if (!item || item.is_deleted || variation.is_deleted || item.item_data?.is_archived || item.item_data?.product_type === "APPOINTMENTS_SERVICE") return [];
  return locations.filter((id) => {
    const isPresent = (object: CatalogObject) => object.present_at_all_locations === false
      ? object.present_at_location_ids?.includes(id) === true
      : !object.absent_at_location_ids?.includes(id);
    if (!isPresent(item) || !isPresent(variation)) return false;
    const override = variation.item_variation_data?.location_overrides?.find((entry) => entry.location_id === id);
    return (override?.track_inventory ?? variation.item_variation_data?.track_inventory) === true;
  });
}

export function stockConversionRatio(variation: CatalogObject): number | null {
  const conversion = variation.item_variation_data?.stockable_conversion;
  if (!conversion) return null;
  const stockable = Number(conversion.stockable_quantity), nonstockable = Number(conversion.nonstockable_quantity);
  if (!Number.isFinite(stockable) || !Number.isFinite(nonstockable) || stockable <= 0 || nonstockable <= 0) throw new Error("Invalid Square stock conversion");
  return stockable / nonstockable;
}
