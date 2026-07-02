export type FacetProduct = {
  id: string;
  product_type: string | null;
  tags: string[] | null;
  category_name: string | null;
};

export type Facets = {
  productTypes: string[];
  tags: string[];
  categories: string[];
  collections: Array<{ id: string; title: string }>;
};

function sortedDistinct(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t.length > 0) set.add(t);
  }
  return Array.from(set).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

export function buildFacets(
  products: FacetProduct[],
  collectionsByProduct: Map<string, Array<{ id: string; title: string }>>
): Facets {
  const productTypes = sortedDistinct(products.map((p) => p.product_type));
  const categories = sortedDistinct(products.map((p) => p.category_name));
  const tags = sortedDistinct(products.flatMap((p) => p.tags ?? []));

  const collectionMap = new Map<string, string>();
  for (const list of collectionsByProduct.values()) {
    for (const c of list) collectionMap.set(c.id, c.title);
  }
  const collections = Array.from(collectionMap.entries())
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

  return { productTypes, tags, categories, collections };
}
