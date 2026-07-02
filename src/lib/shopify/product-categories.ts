export type ShopifyProductCategoryInput = {
  productType?: string | null;
  tags?: string[] | null;
  category?: { name: string | null; fullName: string | null } | null;
  collections?: {
    nodes: Array<{ id: string; title: string; handle: string | null }>;
  } | null;
};

export type NormalizedProductCategories = {
  productType: string | null;
  tags: string[];
  categoryName: string | null;
  categoryFullName: string | null;
  collections: Array<{ shopifyId: string; title: string; handle: string | null }>;
};

function cleanString(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeProductCategories(
  node: ShopifyProductCategoryInput
): NormalizedProductCategories {
  const tags = (node.tags ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const seen = new Set<string>();
  const collections: NormalizedProductCategories["collections"] = [];
  for (const c of node.collections?.nodes ?? []) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    collections.push({ shopifyId: c.id, title: c.title, handle: c.handle ?? null });
  }

  return {
    productType: cleanString(node.productType),
    tags,
    categoryName: cleanString(node.category?.name),
    categoryFullName: cleanString(node.category?.fullName),
    collections,
  };
}
