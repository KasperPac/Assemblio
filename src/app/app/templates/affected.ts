export type AffectedBom = {
  bomId: string;
  variantTitle: string;
  variantSku: string | null;
  version: number;
  status: string;
};

type LinkedBomRow = {
  id: string;
  variant_id: string;
  version: number;
  status: string;
  component_template_id: string | null;
  labor_template_id: string | null;
  variant:
    | { id: string; title: string | null; sku: string | null }
    | Array<{ id: string; title: string | null; sku: string | null }>
    | null;
};

function unwrap<T>(val: T | T[] | null): T | null {
  if (val == null) return null;
  return Array.isArray(val) ? val[0] ?? null : val;
}

export function hasUnpublishedChanges(t: {
  is_linked: boolean;
  lines_updated_at: string | null;
  last_published_at: string | null;
}): boolean {
  if (!t.is_linked || !t.lines_updated_at) return false;
  if (!t.last_published_at) return true;
  return new Date(t.lines_updated_at) > new Date(t.last_published_at);
}

/**
 * Latest version per variant among BOMs linked to the template,
 * excluding deleted variants and lineages whose latest linked version is archived.
 */
export function computeAffectedBoms(
  rows: LinkedBomRow[],
  templateField: "component_template_id" | "labor_template_id",
  templateId: string
): AffectedBom[] {
  const latestByVariant = new Map<string, LinkedBomRow>();
  for (const row of rows) {
    if (row[templateField] !== templateId) continue;
    const variant = unwrap(row.variant);
    if (!variant) continue; // variant no longer exists
    const current = latestByVariant.get(row.variant_id);
    if (!current || row.version > current.version) {
      latestByVariant.set(row.variant_id, row);
    }
  }
  return Array.from(latestByVariant.values())
    .filter((row) => row.status !== "archived")
    .map((row) => {
      const variant = unwrap(row.variant)!;
      return {
        bomId: row.id,
        variantTitle: variant.title ?? "Untitled variant",
        variantSku: variant.sku,
        version: row.version,
        status: row.status,
      };
    })
    .sort((a, b) => a.variantTitle.localeCompare(b.variantTitle));
}
