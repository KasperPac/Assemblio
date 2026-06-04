import styles from "./inventory.module.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import MovementForm from "./movement-form";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import StatusBadge from "../_ui/status-badge";
import HelpLink from "../_ui/help-link";
import ListPanel, { ListRow } from "../_ui/list-panel";

type InventoryRow = {
  id: string;
  on_hand: number;
  in_prod: number;
  reserved: number;
  component:
    | { id: string; name: string | null; sku: string | null; reorder_point?: number | null }
    | Array<{ id: string; name: string | null; sku: string | null; reorder_point?: number | null }>
    | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

type MovementRow = {
  id: string;
  delta_on_hand: number;
  delta_in_prod: number;
  reason: string | null;
  created_at: string;
  component: { name: string | null } | Array<{ name: string | null }> | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function formatSignedValue(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function deltaClass(
  styles: Record<string, string>,
  value: number
): string {
  if (value === 0) return styles.deltaNeutral;
  return value > 0 ? styles.deltaPositive : styles.deltaNegative;
}

export default async function InventoryPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("inventory_balance")
    .select(
      "id,on_hand,in_prod,reserved,component:component_id(id,name,sku,reorder_point),location:location_id(name)"
    )
    .eq("tenant_id", tenantId)
    .order("on_hand", { ascending: false });

  const { data: movements } = await supabase
    .from("inventory_movement")
    .select(
      "id,delta_on_hand,delta_in_prod,reason,created_at,component:component_id(name),location:location_id(name)"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: components } = await supabase
    .from("component")
    .select("id,name,sku")
    .eq("tenant_id", tenantId)
    .order("name");

  const { data: locations } = await supabase
    .from("location")
    .select("id,name,is_default")
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) {
    return (
      <section className={styles.page}>
        <PageHeader
          eyebrow="Operations"
          title="Inventory"
          description="Record movements and monitor live component availability across locations."
        />
        <div className={styles.errorPanel}>
          <h2>Inventory data unavailable</h2>
          <p>Failed to load balances: {error.message}</p>
        </div>
      </section>
    );
  }

  const rows = (data ?? []) as InventoryRow[];
  const movementRows = (movements ?? []) as MovementRow[];
  const defaultLocationCount =
    (locations ?? []).filter((l) => l.is_default).length || 0;
  const totalOnHand = rows.reduce((sum, row) => sum + Number(row.on_hand ?? 0), 0);
  const totalInProd = rows.reduce((sum, row) => sum + Number(row.in_prod ?? 0), 0);
  const totalReserved = rows.reduce((sum, row) => sum + Number(row.reserved ?? 0), 0);
  const lowStockCount = rows.filter((row) => {
    const component = firstOf(row.component);
    return Number(row.on_hand ?? 0) < Number(component?.reorder_point ?? 0);
  }).length;

  const metrics = [
    {
      label: "On hand units",
      value: totalOnHand.toLocaleString(),
      detail: `${rows.length.toLocaleString()} balance rows`,
    },
    {
      label: "Reserved units",
      value: totalReserved.toLocaleString(),
      detail: `${lowStockCount.toLocaleString()} low stock alerts`,
    },
    {
      label: "In production",
      value: totalInProd.toLocaleString(),
      detail: `${defaultLocationCount.toLocaleString()} default location${defaultLocationCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="Record movements, monitor component availability, and inspect the latest ledger activity."
        actions={
          <div className={styles.headerActions}>
            <MovementForm components={components ?? []} locations={locations ?? []} />
            <a className={styles.export} href="/app/inventory/export">
              Export CSV
            </a>
          </div>
        }
      />

      <HelpLink slug="inventory/adjustments" label="How do inventory adjustments work?" />

      {/* Metric strip */}
      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCard}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </div>
        ))}
      </div>

      {/* Balance table */}
      {rows.length === 0 ? (
        <EmptyState
          title="No inventory balances yet"
          message="Receive stock or run a stocktake to establish your first component balances."
        />
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Component</th>
                <th>Location</th>
                <th className={styles.alignRight}>On hand</th>
                <th className={styles.alignRight}>In prod</th>
                <th className={styles.alignRight}>Reserved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const component = firstOf(row.component);
                const location = firstOf(row.location);
                const lowStock =
                  Number(row.on_hand ?? 0) <
                  Number(component?.reorder_point ?? 0);
                return (
                  <tr key={row.id}>
                    <td>
                      {component?.id ? (
                        <Link
                          href={`/app/components/${component.id}`}
                          className={styles.componentLink}
                        >
                          <strong>{component.name ?? "Unknown component"}</strong>
                        </Link>
                      ) : (
                        <strong>{component?.name ?? "Unknown component"}</strong>
                      )}
                      <span className={styles.sku}>
                        {component?.sku ?? "No SKU"}
                      </span>
                    </td>
                    <td>{location?.name ?? "Unassigned"}</td>
                    <td className={styles.alignRight}>
                      {row.on_hand}
                      {lowStock && (
                        <StatusBadge variant="warning">Below reorder</StatusBadge>
                      )}
                    </td>
                    <td className={styles.alignRight}>{row.in_prod}</td>
                    <td className={styles.alignRight}>{row.reserved}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent movements */}
      <ListPanel
        eyebrow="Latest ledger events"
        title="Recent movements"
        columns={["Component", "Location", "On hand Δ", "In prod Δ", "Reason", "Date"]}
        columnsTemplate="1.4fr 0.8fr 0.6fr 0.6fr 0.8fr 1fr"
      >
        {movementRows.length === 0 ? (
          <EmptyState
            title="No movement history yet"
            message="Receipts, allocations, stocktakes, and production completions will appear here."
          />
        ) : (
          movementRows.map((movement) => {
            const component = firstOf(movement.component);
            const location = firstOf(movement.location);
            return (
              <ListRow
                key={movement.id}
                columnsTemplate="1.4fr 0.8fr 0.6fr 0.6fr 0.8fr 1fr"
              >
                <strong>{component?.name ?? "Unknown"}</strong>
                <span>{location?.name ?? "Unassigned"}</span>
                <span className={deltaClass(styles, movement.delta_on_hand)}>
                  {formatSignedValue(movement.delta_on_hand)}
                </span>
                <span className={deltaClass(styles, movement.delta_in_prod)}>
                  {formatSignedValue(movement.delta_in_prod)}
                </span>
                <StatusBadge>{movement.reason ?? "movement"}</StatusBadge>
                <span className={styles.meta}>
                  {new Date(movement.created_at).toLocaleDateString("en-AU")}
                </span>
              </ListRow>
            );
          })
        )}
      </ListPanel>
    </section>
  );
}
