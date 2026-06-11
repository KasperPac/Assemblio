import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./components.module.css";
import ComponentCreateForm from "./component-create-form";
import ComponentTable, { type ComponentSection } from "./component-table";
import { createComponent } from "./actions";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import { getStockStatus } from "./helpers";

type ComponentRow = {
  id: string;
  name: string;
  sku: string | null;
  reorder_point: number | null;
  group_id: string | null;
  description: string | null;
};

type BalanceRow = {
  component_id: string;
  on_hand: number;
  reserved: number;
};

type Props = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    sort?: string;
    dir?: string;
  }>;
};


export default async function ComponentsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const rawQ = params.q ?? "";
  const q = rawQ.trim().toLowerCase();
  const sortCol = (params.sort ?? "name") as "name" | "sku" | "on_hand" | "available" | "reorder_point";
  const sortDir = params.dir === "desc" ? "desc" : "asc";

  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId, role } = context;

  const [
    { data: components, error },
    { data: balances },
    { data: suppliers },
    { data: locations },
    { data: groups },
  ] = await Promise.all([
    supabase.from("component").select("id,name,sku,reorder_point,group_id,description").eq("tenant_id", tenantId).is("archived_at", null).order("name"),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
    supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).order("name"),
    supabase.from("location").select("id,name").eq("tenant_id", tenantId).order("name"),
    supabase.from("component_group").select("id,name").eq("tenant_id", tenantId).order("name"),
  ]);

  const balanceMap = (balances ?? []).reduce<Record<string, BalanceRow>>((acc, row) => {
    acc[row.component_id] = row;
    return acc;
  }, {});

  const allComponents = (components ?? []) as ComponentRow[];
  const filterLowStock = params.filter === "lowstock";

  const withStatus = allComponents.map((c) => {
    const balance = balanceMap[c.id];
    const onHand = balance?.on_hand ?? 0;
    const reserved = balance?.reserved ?? 0;
    const available = onHand - reserved;
    const status = getStockStatus(available, c.reorder_point ?? 0);
    return { ...c, onHand, available, status };
  });

  const sortedComponents = [...withStatus].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    switch (sortCol) {
      case "sku":           aVal = (a.sku ?? "").toLowerCase();   bVal = (b.sku ?? "").toLowerCase();   break;
      case "on_hand":       aVal = a.onHand;                     bVal = b.onHand;                     break;
      case "available":     aVal = a.available;                  bVal = b.available;                  break;
      case "reorder_point": aVal = a.reorder_point ?? 0;         bVal = b.reorder_point ?? 0;         break;
      default:              aVal = a.name.toLowerCase();         bVal = b.name.toLowerCase();
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const lowStockCount = withStatus.filter((c) => c.status !== "ok").length;

  const filtered = sortedComponents.filter((c) => {
    const matchesSearch =
      q.length === 0 ||
      c.name.toLowerCase().includes(q) ||
      (c.sku ?? "").toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q);
    const matchesFilter = !filterLowStock || c.status !== "ok";
    return matchesSearch && matchesFilter;
  });

  // Group filtered components by their group, in group-name order, ungrouped last
  type Section = { groupId: string | null; groupName: string | null; items: typeof filtered };
  const knownGroupIds = new Set((groups ?? []).map((g) => g.id));
  const groupedSections: Section[] = [];
  for (const group of (groups ?? [])) {
    const items = filtered.filter((c) => c.group_id === group.id);
    if (items.length > 0) groupedSections.push({ groupId: group.id, groupName: group.name, items });
  }
  const ungrouped = filtered.filter((c) => !c.group_id || !knownGroupIds.has(c.group_id));
  if (ungrouped.length > 0) groupedSections.push({ groupId: null, groupName: null, items: ungrouped });

  const lookups = {
    suppliers: (suppliers ?? []) as Array<{ id: string; name: string }>,
    locations: (locations ?? []) as Array<{ id: string; name: string }>,
    groups: (groups ?? []) as Array<{ id: string; name: string }>,
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Products"
        title="Components"
        description={`${filtered.length} of ${allComponents.length} components in the current catalog.`}
        actions={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {(role === "admin" || role === "super_admin") && (
              <Link href="/app/components/import" className={styles.importLink}>
                Import CSV
              </Link>
            )}
            <ComponentCreateForm action={createComponent} lookups={lookups} />
          </div>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <a
            href={rawQ ? `/app/components?q=${encodeURIComponent(rawQ)}` : "/app/components"}
            className={!filterLowStock ? styles.tabActive : styles.tab}
          >
            All <span className={styles.tabCount}>{allComponents.length}</span>
          </a>
          <a
            href={rawQ ? `/app/components?filter=lowstock&q=${encodeURIComponent(rawQ)}` : "/app/components?filter=lowstock"}
            className={filterLowStock ? styles.tabActive : styles.tab}
          >
            Low Stock{" "}
            {lowStockCount > 0 && (
              <span className={styles.tabBadge}>{lowStockCount}</span>
            )}
          </a>
        </div>
        <form className={styles.search} method="get">
          {filterLowStock && <input type="hidden" name="filter" value="lowstock" />}
          {sortCol !== "name" && <input type="hidden" name="sort" value={sortCol} />}
          {sortCol !== "name" && sortDir === "desc" && <input type="hidden" name="dir" value={sortDir} />}
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name or SKU"
            aria-label="Search by name or SKU"
          />
        </form>
      </div>

      {error ? (
        <EmptyState title="Failed to load" message="Could not load components. Please refresh." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filterLowStock ? "All stocked up" : q.length > 0 ? "No results" : "No components yet"}
          message={
            filterLowStock
              ? "All components have sufficient available stock."
              : q.length > 0
              ? "No components match that search."
              : "Add your first component to get started."
          }
        />
      ) : (
        <div className={styles.tableCard}>
          <ComponentTable
            sections={groupedSections as ComponentSection[]}
            sortCol={sortCol}
            sortDir={sortDir}
            rawQ={rawQ}
            filterLowStock={filterLowStock}
          />
        </div>
      )}
    </div>
  );
}
