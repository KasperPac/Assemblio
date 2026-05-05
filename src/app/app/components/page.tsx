import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./components.module.css";
import ComponentCreateForm from "./component-create-form";
import { createComponent } from "./actions";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";
import { getStockStatus } from "./helpers";

type ComponentRow = {
  id: string;
  name: string;
  sku: string | null;
  reorder_point: number | null;
};

type BalanceRow = {
  component_id: string;
  on_hand: number;
  in_prod: number;
  reserved: number;
};

type Props = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
  }>;
};

export default async function ComponentsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const supabase = await createSupabaseServerClient();

  const [
    { data: components, error },
    { data: balances },
    { data: suppliers },
    { data: locations },
    { data: groups },
  ] = await Promise.all([
    supabase.from("component").select("id,name,sku,reorder_point").order("name"),
    supabase.from("inventory_balance").select("component_id,on_hand,in_prod,reserved"),
    supabase.from("suppliers").select("id,name").order("name"),
    supabase.from("location").select("id,name").order("name"),
    supabase.from("component_group").select("id,name").order("name"),
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

  const lowStockCount = withStatus.filter((c) => c.status !== "ok").length;

  const filtered = withStatus.filter((c) => {
    const matchesSearch =
      q.length === 0 ||
      c.name.toLowerCase().includes(q) ||
      (c.sku ?? "").toLowerCase().includes(q);
    const matchesFilter = !filterLowStock || c.status !== "ok";
    return matchesSearch && matchesFilter;
  });

  const lookups = {
    suppliers: (suppliers ?? []) as Array<{ id: string; name: string }>,
    locations: (locations ?? []) as Array<{ id: string; name: string }>,
    groups: (groups ?? []) as Array<{ id: string; name: string }>,
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Components"
        title="Component catalog"
        description={`${filtered.length} of ${allComponents.length} components in the current catalog.`}
        actions={<ComponentCreateForm action={createComponent} lookups={lookups} />}
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <a
            href="/app/components"
            className={!filterLowStock ? styles.tabActive : styles.tab}
          >
            All <span className={styles.tabCount}>{allComponents.length}</span>
          </a>
          <a
            href="/app/components?filter=lowstock"
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
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name or SKU"
            aria-label="Search by name or SKU"
          />
        </form>
      </div>

      <ListPanel
        eyebrow="Catalog"
        title="Stocked components"
        description="Open a component to inspect balances, movement history, and BOM usage."
        columns={["Component", "SKU", "On hand", "Available", "Reorder"]}
        columnsTemplate="1.6fr 1fr 0.8fr 0.8fr 0.8fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load components"
            message="The component catalog could not be loaded from Supabase."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              filterLowStock
                ? "No low stock components"
                : q.length > 0
                ? "No matching components"
                : "No components yet"
            }
            message={
              filterLowStock
                ? "All components have sufficient available stock."
                : q.length > 0
                ? "Try a broader search term or clear the filter."
                : "Create a component to start tracking stocked parts."
            }
          />
        ) : (
          filtered.map((component) => (
            <Link
              key={component.id}
              href={`/app/components/${component.id}`}
              className={`${styles.rowLink} ${
                component.status === "critical"
                  ? styles.rowCritical
                  : component.status === "low"
                  ? styles.rowLow
                  : ""
              }`}
            >
              <ListRow
                columnsTemplate="1.6fr 1fr 0.8fr 0.8fr 0.8fr"
                className={styles.row}
              >
                <strong className={styles.nameCell}>
                  <span
                    className={`${styles.dot} ${
                      component.status === "critical"
                        ? styles.dotCritical
                        : component.status === "low"
                        ? styles.dotLow
                        : styles.dotOk
                    }`}
                  />
                  {component.name}
                </strong>
                <span className={styles.meta}>{component.sku ?? "--"}</span>
                <span>{component.onHand}</span>
                <span className={component.status !== "ok" ? styles.availableLow : ""}>
                  {component.available}
                </span>
                <span className={styles.meta}>{component.reorder_point ?? 0}</span>
              </ListRow>
            </Link>
          ))
        )}
      </ListPanel>
    </div>
  );
}
