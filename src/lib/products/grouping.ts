export type CategoryProduct = {
  id: string;
  product_type: string | null;
  tags: string[] | null;
  category_name: string | null;
};

export type ProductCollection = { id: string; title: string };

export type CategoryFilters = {
  type?: string;
  category?: string;
  tags?: string[];
  collections?: string[];
};

export type GroupBy = "none" | "type" | "category" | "collection";

export const UNCATEGORISED = "Uncategorised";

export function matchesCategoryFilters(
  product: CategoryProduct,
  collections: ProductCollection[],
  filters: CategoryFilters
): boolean {
  if (filters.type && product.product_type !== filters.type) return false;
  if (filters.category && product.category_name !== filters.category) return false;

  if (filters.tags && filters.tags.length > 0) {
    const productTags = new Set(product.tags ?? []);
    if (!filters.tags.every((t) => productTags.has(t))) return false;
  }

  if (filters.collections && filters.collections.length > 0) {
    const productCollectionIds = new Set(collections.map((c) => c.id));
    if (!filters.collections.some((id) => productCollectionIds.has(id))) return false;
  }

  return true;
}

export function resolveGroupKey(
  product: CategoryProduct,
  collections: ProductCollection[],
  groupBy: GroupBy
): string {
  switch (groupBy) {
    case "type":
      return product.product_type?.trim() || UNCATEGORISED;
    case "category":
      return product.category_name?.trim() || UNCATEGORISED;
    case "collection":
      return collections[0]?.title?.trim() || UNCATEGORISED;
    case "none":
    default:
      return "";
  }
}
