export type RetailItemInput = {
  variantId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  costPerUnit: number;
  supplierId: string | null;
  locationId: string | null;
  reorderPoint: number;
};

function text(form: FormData, key: string): string | null {
  const v = form.get(key)?.toString().trim() ?? "";
  return v === "" ? null : v;
}

function nonNegative(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseRetailItemForm(
  form: FormData
): { ok: true; value: RetailItemInput } | { ok: false; error: string } {
  const name = text(form, "name");
  if (!name) return { ok: false, error: "Name is required." };
  const costPerUnit = nonNegative(form, "cost_per_unit");
  if (costPerUnit === null) return { ok: false, error: "Cost must be a number of 0 or more." };
  const reorderPoint = nonNegative(form, "reorder_point");
  if (reorderPoint === null) return { ok: false, error: "Reorder point must be a number of 0 or more." };
  return {
    ok: true,
    value: {
      variantId: text(form, "variant_id"),
      name,
      sku: text(form, "sku"),
      barcode: text(form, "barcode"),
      costPerUnit,
      supplierId: text(form, "supplier_id"),
      locationId: text(form, "location_id"),
      reorderPoint,
    },
  };
}
