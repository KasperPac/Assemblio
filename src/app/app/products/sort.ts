export type SortKey = "title" | "variants" | "status" | "price" | "mat_gp" | "actual_gp";
export type SortDir = "asc" | "desc";

export type ProductSortRow = {
  title: string;
  variantCount: number;
  status: string;
  sellPrice: number | null;
  matGpPct: number | null;
  actualGpPct: number | null;
};

const SORT_KEYS: ReadonlyArray<SortKey> = [
  "title",
  "variants",
  "status",
  "price",
  "mat_gp",
  "actual_gp",
];

export function parseSortParams(
  sort: string | undefined,
  dir: string | undefined
): { sort: SortKey | null; dir: SortDir } {
  const sortKey = SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : null;
  return { sort: sortKey, dir: dir === "desc" ? "desc" : "asc" };
}

function valueFor(row: ProductSortRow, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return row.title.toLowerCase();
    case "variants":
      return row.variantCount;
    case "status":
      return row.status;
    case "price":
      return row.sellPrice;
    case "mat_gp":
      return row.matGpPct;
    case "actual_gp":
      return row.actualGpPct;
  }
}

export function sortProductRows<T extends ProductSortRow>(
  rows: T[],
  sort: SortKey | null,
  dir: SortDir
): T[] {
  if (!sort) return rows;
  const mult = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = valueFor(a, sort);
    const bv = valueFor(b, sort);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of direction
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return mult * av.localeCompare(bv);
    }
    return mult * (Number(av) - Number(bv));
  });
}
