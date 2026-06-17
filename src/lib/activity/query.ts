export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityFilters = {
  page: number;
  event: string | null;
  actorId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function parseActivityFilters(params: RawParams): ActivityFilters {
  const pageRaw = Number(first(params.page) ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const norm = (v: string | null) => (v && v.trim().length > 0 ? v.trim() : null);
  return {
    page,
    event: norm(first(params.event)),
    actorId: norm(first(params.actor)),
    dateFrom: norm(first(params.from)),
    dateTo: norm(first(params.to)),
    search: norm(first(params.q)),
  };
}

export function activityRange(page: number, pageSize = ACTIVITY_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPages(count: number, pageSize = ACTIVITY_PAGE_SIZE) {
  return Math.max(1, Math.ceil(count / pageSize));
}
