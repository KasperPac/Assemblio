export const ORDER_SORT_KEYS = [
  "order_date",
  "order_number",
  "customer_email",
  "status",
  "target_ship_date",
  "total",
] as const;
export type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];

export type HistoricalFilter = "all" | "only" | "hide";

export type OrdersQuery = {
  search: string | null;
  status: string | null;
  source: string | null;
  historical: HistoricalFilter;
  dateFrom: string | null;
  dateTo: string | null;
  sort: OrderSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE = 25;

function clean(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function parseOrdersQuery(
  sp: Record<string, string | undefined>
): OrdersQuery {
  const sortRaw = clean(sp.sort);
  const sort: OrderSortKey =
    sortRaw && (ORDER_SORT_KEYS as readonly string[]).includes(sortRaw)
      ? (sortRaw as OrderSortKey)
      : "order_date";

  const dir = clean(sp.dir) === "asc" ? "asc" : "desc";

  const histRaw = clean(sp.historical);
  const historical: HistoricalFilter =
    histRaw === "only" || histRaw === "hide" ? histRaw : "all";

  const pageNum = Number.parseInt(sp.page ?? "", 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

  return {
    search: clean(sp.search),
    status: clean(sp.status),
    source: clean(sp.source),
    historical,
    dateFrom: clean(sp.dateFrom),
    dateTo: clean(sp.dateTo),
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}
