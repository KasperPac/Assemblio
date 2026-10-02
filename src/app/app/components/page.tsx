import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./components.module.css";
import ComponentCreateForm from "./component-create-form";
import ComponentTable from "./component-table";
import FilterRail, { ActiveFilterChips, type Chip } from "./filter-rail";
import { createComponent } from "./actions";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import SearchInput from "../_ui/search-input";
import { getStockStatus } from "./helpers";
import {
  NONE,
  STOCK_STATUSES,
  buildFacetCounts,
  costBounds,
  filterComponents,
  parseComponentFilters,
  type ComponentFilterParams,
  type StockStatus,
} from "@/lib/components/filters";

type ComponentRow = {
  id: string;
  name: string;
  sku: string | null;
  reorder_point: number | null;
  group_id: string | null;
  supplier_id: string | null;
  cost_per_unit: number | null;
  description: string | null;
};

type BalanceRow = {
  component_id: string;
  on_hand: number;
  reserved: number;
};

type SortCol = "name" | "sku" | "group" | "on_hand" | "available" | "reorder_point" | "cost";

type Props = {
  searchParams?: Promise<ComponentFilterParams & {
    q?: string;
    sort?: string;
    dir?: string;
  }>;
};

const STATUS_LABELS: Record<StockStatus, string> = { ok: "OK", low: "Low", critical: "Critical" };

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function ComponentsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawQ = params.q ?? "";
  const q = rawQ.trim().toLowerCase();
  const sortCol = (params.sort ?? "name") as SortCol;
  const sortDir = params.dir === "desc" ? "desc" : "asc";
  const filters = parseComponentFilters(params);

  const context = await getServerTenantContext();
  if (!context) redirect("/login");
  const { supabase, tenantId, role } = context;

  const [
    { data: components, error },
    { data: balances },
    { data: suppliers },
    { data: locations },
    { data: groups },
  ] = await Promise.all([
    supabase.from("component").select("id,name,sku,reorder_point,group_id,supplier_id,cost_per_unit,description").eq("tenant_id", tenantId).is("archived_at", null).order("name"),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
    supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).order("name"),
    supabase.from("location").select("id,name").eq("tenant_id", tenantId).order("name"),
    supabase.from("component_group").select("id,name").eq("tenant_id", tenantId).order("name"),
  ]);

  const balanceMap = (balances ?? []).reduce<Record<string, BalanceRow>>((acc, row) => {
    acc[row.component_id] = row;
    return acc;
  }, {});

  const groupList = (groups ?? []) as Array<{ id: string; name: string }>;
  const supplierList = (suppliers ?? []) as Array<{ id: string; name: string }>;
  const groupNames = new Map(groupList.map((g) => [g.id, g.name]));
  const knownSupplierIds = new Set(supplierList.map((s) => s.id));

  const allComponents = (components ?? []) as ComponentRow[];

  const withStatus = allComponents.map((c) => {
    const balance = balanceMap[c.id];
    const onHand = balance?.on_hand ?? 0;
    const reserved = balance?.reserved ?? 0;
    const available = onHand - reserved;
    const status = getStockStatus(available, c.reorder_point ?? 0);
    // A group or supplier that no longer exists counts as none.
    const groupName = c.group_id ? groupNames.get(c.group_id) ?? null : null;
    return {
      ...c,
      onHand,
      available,
      status,
      costPerUnit: Number(c.cost_per_unit ?? 0),
      groupName,
      groupKey: groupName !== null ? (c.group_id as string) : NONE,
      supplierKey: c.supplier_id && knownSupplierIds.has(c.supplier_id) ? c.supplier_id : NONE,
    };
  });

  const sortedComponents = [...withStatus].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    switch (sortCol) {
      case "sku":           aVal = (a.sku ?? "").toLowerCase();   bVal = (b.sku ?? "").toLowerCase();   break;
      // Ungrouped sorts last in ascending order ("~" follows letters and digits).
      case "group":         aVal = (a.groupName ?? "~").toLowerCase(); bVal = (b.groupName ?? "~").toLowerCase(); break;
      case "on_hand":       aVal = a.onHand;                     bVal = b.onHand;                     break;
      case "available":     aVal = a.available;                  bVal = b.available;                  break;
      case "reorder_point": aVal = a.reorder_point ?? 0;         bVal = b.reorder_point ?? 0;         break;
      case "cost":          aVal = a.costPerUnit;                bVal = b.costPerUnit;                break;
      default:              aVal = a.name.toLowerCase();         bVal = b.name.toLowerCase();
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Search narrows the pool the rail counts against; the facets then filter it.
  const searched = sortedComponents.filter((c) =>
    q.length === 0 ||
    c.name.toLowerCase().includes(q) ||
    (c.sku ?? "").toLowerCase().includes(q) ||
    (c.description ?? "").toLowerCase().includes(q)
  );
  const filtered = filterComponents(searched, filters);
  const counts = buildFacetCounts(searched, filters);
  const bounds = costBounds(withStatus);

  const hasUngrouped = withStatus.some((c) => c.groupKey === NONE);
  const hasNoSupplier = withStatus.some((c) => c.supplierKey === NONE);
  const groupOptions = [
    ...groupList.map((g) => ({ key: g.id, label: g.name, count: counts.groups.get(g.id) ?? 0 })),
    ...(hasUngrouped ? [{ key: NONE, label: "Ungrouped", count: counts.groups.get(NONE) ?? 0 }] : []),
  ];
  const supplierOptions = [
    ...supplierList.map((s) => ({ key: s.id, label: s.name, count: counts.suppliers.get(s.id) ?? 0 })),
    ...(hasNoSupplier ? [{ key: NONE, label: "No supplier", count: counts.suppliers.get(NONE) ?? 0 }] : []),
  ];
  const statusOptions = STOCK_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], count: counts.statuses[s] }));

  const selected = {
    statuses: [...(filters.statuses ?? [])],
    groups: [...(filters.groups ?? [])],
    suppliers: [...(filters.suppliers ?? [])],
  };
  const labelFor = (options: Array<{ key: string; label: string }>, key: string) =>
    options.find((o) => o.key === key)?.label ?? key;
  const chips: Chip[] = [
    ...selected.statuses.map((v) => ({ label: STATUS_LABELS[v as StockStatus], param: "status", value: v })),
    ...selected.groups.map((v) => ({ label: labelFor(groupOptions, v), param: "groups", value: v })),
    ...selected.suppliers.map((v) => ({ label: labelFor(supplierOptions, v), param: "suppliers", value: v })),
    ...(filters.costMin !== null || filters.costMax !== null
      ? [{
          label: `Cost ${money(filters.costMin ?? bounds.min)}–${money(filters.costMax ?? bounds.max)}`,
          param: "cost",
          value: null,
        }]
      : []),
  ];

  // Sort and detail links carry every current filter, so sorting never drops them.
  const baseParams = new URLSearchParams();
  for (const key of ["q", "status", "groups", "suppliers", "cost_min", "cost_max"] as const) {
    const value = params[key];
    if (value) baseParams.set(key, value);
  }
  if (params.filter === "lowstock" && !params.status) baseParams.set("status", "low,critical");

  const filtersActive = chips.length > 0;
  const lookups = { suppliers: supplierList, locations: (locations ?? []) as Array<{ id: string; name: string }>, groups: groupList };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Products"
        title="Components"
        description={`${filtered.length} of ${allComponents.length} components in the current catalog.`}
        actions={
          <div className={styles.headerActions}>
            {(role === "admin" || role === "super_admin") && (
              <Link href="/app/components/import" className={styles.importLink}>
                Import CSV
              </Link>
            )}
            <ComponentCreateForm action={createComponent} lookups={lookups} />
          </div>
        }
      />

      <div className={styles.layout}>
        <FilterRail
          statuses={statusOptions}
          groups={groupOptions}
          suppliers={supplierOptions}
          selected={selected}
          cost={{ bounds, min: filters.costMin, max: filters.costMax }}
        />

        <div className={styles.results}>
          <div className={styles.search}>
            <SearchInput
              param="q"
              placeholder="Search by name, SKU, or description"
              ariaLabel="Search by name, SKU, or description"
            />
          </div>

          <ActiveFilterChips chips={chips} />

          {error ? (
            <EmptyState title="Failed to load" message="Could not load components. Please refresh." />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={filtersActive || q.length > 0 ? "No results" : "No components yet"}
              message={
                filtersActive || q.length > 0
                  ? "No components match those filters. Try widening or clearing them."
                  : "Add your first component to get started."
              }
            />
          ) : (
            <div className={styles.tableCard}>
              <ComponentTable
                items={filtered}
                sortCol={sortCol}
                sortDir={sortDir}
                baseParams={baseParams.toString()}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
