import { describe, expect, it } from "vitest";
import {
  NONE,
  buildFacetCounts,
  costBounds,
  filterComponents,
  parseComponentFilters,
  type FilterableComponent,
} from "./filters";

const items: FilterableComponent[] = [
  { id: "a", groupKey: "g1", supplierKey: "s1", costPerUnit: 2, status: "ok" },
  { id: "b", groupKey: "g1", supplierKey: "s2", costPerUnit: 10, status: "low" },
  { id: "c", groupKey: "g2", supplierKey: "s1", costPerUnit: 25, status: "critical" },
  { id: "d", groupKey: NONE, supplierKey: NONE, costPerUnit: 0, status: "ok" },
];

const ids = (list: FilterableComponent[]) => list.map((c) => c.id);

describe("parseComponentFilters", () => {
  it("returns no active filters for an empty query", () => {
    expect(parseComponentFilters({})).toEqual({
      statuses: null, groups: null, suppliers: null, costMin: null, costMax: null,
    });
  });

  it("parses comma lists and numbers", () => {
    const f = parseComponentFilters({
      status: "low,critical", groups: "g1,none", suppliers: "s2", cost_min: "5", cost_max: "20.5",
    });
    expect([...(f.statuses ?? [])]).toEqual(["low", "critical"]);
    expect([...(f.groups ?? [])]).toEqual(["g1", NONE]);
    expect([...(f.suppliers ?? [])]).toEqual(["s2"]);
    expect(f.costMin).toBe(5);
    expect(f.costMax).toBe(20.5);
  });

  it("maps the legacy ?filter=lowstock link to low + critical", () => {
    expect([...(parseComponentFilters({ filter: "lowstock" }).statuses ?? [])].sort())
      .toEqual(["critical", "low"]);
  });

  it("an explicit status wins over the legacy lowstock link", () => {
    expect([...(parseComponentFilters({ filter: "lowstock", status: "ok" }).statuses ?? [])])
      .toEqual(["ok"]);
  });

  it("ignores unknown statuses, blank lists and non-numeric costs", () => {
    const f = parseComponentFilters({ status: "bogus", groups: ",", cost_min: "abc", cost_max: "" });
    expect(f.statuses).toBeNull();
    expect(f.groups).toBeNull();
    expect(f.costMin).toBeNull();
    expect(f.costMax).toBeNull();
  });
});

describe("filterComponents", () => {
  it("returns everything when no filter is active", () => {
    expect(ids(filterComponents(items, parseComponentFilters({})))).toEqual(["a", "b", "c", "d"]);
  });

  it("ANDs across facets and ORs within one", () => {
    const f = parseComponentFilters({ groups: "g1,g2", suppliers: "s1" });
    expect(ids(filterComponents(items, f))).toEqual(["a", "c"]);
  });

  it("matches ungrouped and supplier-less components with the none key", () => {
    expect(ids(filterComponents(items, parseComponentFilters({ groups: NONE })))).toEqual(["d"]);
    expect(ids(filterComponents(items, parseComponentFilters({ suppliers: NONE })))).toEqual(["d"]);
  });

  it("applies an inclusive cost range", () => {
    expect(ids(filterComponents(items, parseComponentFilters({ cost_min: "2", cost_max: "10" }))))
      .toEqual(["a", "b"]);
  });

  it("filters by stock status", () => {
    expect(ids(filterComponents(items, parseComponentFilters({ filter: "lowstock" })))).toEqual(["b", "c"]);
  });
});

describe("buildFacetCounts", () => {
  it("counts each facet option against the other active filters, not its own", () => {
    // Groups filtered to g1: the group counts must still show g2 and none,
    // otherwise the user could never widen the selection.
    const counts = buildFacetCounts(items, parseComponentFilters({ groups: "g1" }));
    expect(counts.groups.get("g1")).toBe(2);
    expect(counts.groups.get("g2")).toBe(1);
    expect(counts.groups.get(NONE)).toBe(1);
    // Other facets are narrowed by the group filter.
    expect(counts.statuses).toEqual({ ok: 1, low: 1, critical: 0 });
    expect(counts.suppliers.get("s1")).toBe(1);
    expect(counts.suppliers.get("s2")).toBe(1);
    expect(counts.suppliers.get(NONE) ?? 0).toBe(0);
  });

  it("status counts ignore the status filter itself", () => {
    const counts = buildFacetCounts(items, parseComponentFilters({ status: "ok" }));
    expect(counts.statuses).toEqual({ ok: 2, low: 1, critical: 1 });
  });
});

describe("costBounds", () => {
  it("spans the whole catalogue, rounded outward to whole units", () => {
    expect(costBounds([...items, { ...items[0], id: "e", costPerUnit: 12.4 }])).toEqual({ min: 0, max: 25 });
    expect(costBounds([{ ...items[0], costPerUnit: 1.2 }, { ...items[0], id: "z", costPerUnit: 7.3 }]))
      .toEqual({ min: 1, max: 8 });
  });

  it("returns zeros for an empty catalogue", () => {
    expect(costBounds([])).toEqual({ min: 0, max: 0 });
  });
});
