export type CopySourceBomRow = {
  id: string;
  variant_id: string;
  version: number;
  status: string;
  is_active: boolean;
};

export type PickedBom = { bomId: string; version: number };

export type CopySourceVariant = {
  bomId: string;
  variantId: string;
  label: string;
};

export type CopySourceProduct = {
  productId: string;
  productTitle: string;
  variantCount: number;
};

export type CopySourceProductGroup = {
  productId: string;
  productTitle: string;
  variants: CopySourceVariant[];
};

/**
 * Resolve one BOM per variant: the active BOM wins; otherwise the highest
 * non-archived version. Variants with only archived BOMs are excluded.
 */
export function pickBomPerVariant(
  rows: CopySourceBomRow[]
): Record<string, PickedBom> {
  const byVariant = new Map<string, CopySourceBomRow[]>();
  for (const row of rows) {
    if (row.status === "archived") continue;
    const list = byVariant.get(row.variant_id);
    if (list) list.push(row);
    else byVariant.set(row.variant_id, [row]);
  }

  const result: Record<string, PickedBom> = {};
  for (const [variantId, candidates] of byVariant) {
    const actives = candidates.filter((c) => c.is_active);
    const pool = actives.length > 0 ? actives : candidates;
    const best = pool.reduce((a, b) => (b.version > a.version ? b : a));
    result[variantId] = { bomId: best.id, version: best.version };
  }
  return result;
}

export function variantLabel(title: string | null, sku: string | null): string {
  const base = title?.trim() || "Untitled variant";
  return sku ? `${base} (${sku})` : base;
}
