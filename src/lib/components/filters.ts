// Filter rail for /app/components: URL parsing, matching, and per-option
// counts. Pure so the page can stay server-rendered and the logic is tested
// on its own.

export type StockStatus = "ok" | "low" | "critical";

export const STOCK_STATUSES: StockStatus[] = ["ok", "low", "critical"];

/** Key used for "Ungrouped" and "No supplier" in the URL and in counts. */
export const NONE = "none";

export type FilterableComponent = {
  id: string;
  /** Group id, or NONE when ungrouped (or pointing at a deleted group). */
  groupKey: string;
  /** Supplier id, or NONE. */
  supplierKey: string;
  costPerUnit: number;
  status: StockStatus;
};

/** A null facet is inactive: it matches everything. */
export type ComponentFilters = {
  statuses: Set<StockStatus> | null;
  groups: Set<string> | null;
  suppliers: Set<string> | null;
  costMin: number | null;
  costMax: number | null;
};

type Facet = "statuses" | "groups" | "suppliers" | "cost";

export type ComponentFilterParams = {
  status?: string;
  groups?: string;
  suppliers?: string;
  cost_min?: string;
  cost_max?: string;
  /** Legacy tab link: `?filter=lowstock`. */
  filter?: string;
};

function list(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

function setOrNull<T>(values: T[]): Set<T> | null {
  return values.length > 0 ? new Set(values) : null;
}

function num(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseComponentFilters(params: ComponentFilterParams): ComponentFilters {
  let statuses = list(params.status).filter((s): s is StockStatus =>
    (STOCK_STATUSES as string[]).includes(s)
  );
  if (statuses.length === 0 && params.status === undefined && params.filter === "lowstock") {
    statuses = ["low", "critical"];
  }
  return {
    statuses: setOrNull(statuses),
    groups: setOrNull(list(params.groups)),
    suppliers: setOrNull(list(params.suppliers)),
    costMin: num(params.cost_min),
    costMax: num(params.cost_max),
  };
}

function matches(c: FilterableComponent, f: ComponentFilters, skip?: Facet): boolean {
  if (skip !== "statuses" && f.statuses && !f.statuses.has(c.status)) return false;
  if (skip !== "groups" && f.groups && !f.groups.has(c.groupKey)) return false;
  if (skip !== "suppliers" && f.suppliers && !f.suppliers.has(c.supplierKey)) return false;
  if (skip !== "cost") {
    if (f.costMin !== null && c.costPerUnit < f.costMin) return false;
    if (f.costMax !== null && c.costPerUnit > f.costMax) return false;
  }
  return true;
}

export function filterComponents<T extends FilterableComponent>(items: T[], f: ComponentFilters): T[] {
  return items.filter((c) => matches(c, f));
}

export type FacetCounts = {
  statuses: Record<StockStatus, number>;
  groups: Map<string, number>;
  suppliers: Map<string, number>;
};

// Flight-search counts: each option shows how many results it would give with
// every OTHER facet applied. Counting against its own facet would zero out the
// unselected options and leave no way to widen the selection.
export function buildFacetCounts(items: FilterableComponent[], f: ComponentFilters): FacetCounts {
  const statuses: Record<StockStatus, number> = { ok: 0, low: 0, critical: 0 };
  const groups = new Map<string, number>();
  const suppliers = new Map<string, number>();
  for (const c of items) {
    if (matches(c, f, "statuses")) statuses[c.status] += 1;
    if (matches(c, f, "groups")) groups.set(c.groupKey, (groups.get(c.groupKey) ?? 0) + 1);
    if (matches(c, f, "suppliers")) suppliers.set(c.supplierKey, (suppliers.get(c.supplierKey) ?? 0) + 1);
  }
  return { statuses, groups, suppliers };
}

/** Slider bounds over the whole catalogue, rounded outward to whole units. */
export function costBounds(items: FilterableComponent[]): { min: number; max: number } {
  if (items.length === 0) return { min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const c of items) {
    if (c.costPerUnit < min) min = c.costPerUnit;
    if (c.costPerUnit > max) max = c.costPerUnit;
  }
  return { min: Math.floor(min), max: Math.ceil(max) };
}
