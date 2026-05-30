import styles from "./inventory.module.css";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import MovementForm from "./movement-form";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import StatusBadge from "../_ui/status-badge";
import HelpLink from "../_ui/help-link";

type InventoryRow = {
  id: string;
  on_hand: number;
  in_prod: number;
  reserved: number;
  component:
    | { name: string | null; sku: string | null; reorder_point?: number | null }
    | Array<{ name: string | null; sku: string | null; reorder_point?: number | null }>
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

export default async function InventoryPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("inventory_balance")
    .select(
      "id,on_hand,in_prod,reserved,component:component_id(name,sku,reorder_point),location:location_id(name)"
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
    (locations ?? []).filter((location) => location.is_default).length || 0;
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
        description="Record movements, monitor component availability, and inspect the latest ledger activity without leaving the operator flow."
        actions={
          <a className={styles.export} href="/app/inventory/export">
            Export CSV
          </a>
        }
      />
      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCard}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.primaryColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Movement entry</p>
                <h2>Log inventory movement</h2>
              </div>
              <StatusBadge variant="info">Append-only ledger</StatusBadge>
              <HelpLink slug="inventory/adjustments" label="How do inventory adjustments work?" />
            </div>
            <p className={styles.panelIntro}>
              Every adjustment should be captured here so movement history and
              live balances remain aligned.
            </p>
            <MovementForm components={components ?? []} locations={locations ?? []} />
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Balance view</p>
                <h2>Component positions by location</h2>
              </div>
              <StatusBadge variant={lowStockCount > 0 ? "warning" : "success"}>
                {lowStockCount > 0 ? `${lowStockCount} alerts` : "Healthy"}
              </StatusBadge>
            </div>
            {rows.length === 0 ? (
              <EmptyState
                title="No inventory balances yet"
                message="Receive stock or run a stocktake to establish your first component balances."
              />
            ) : (
              <div className={styles.balanceTable}>
                <div className={styles.balanceHeader}>
                  <span>Component</span>
                  <span>Location</span>
                  <span>On hand</span>
                  <span>In prod</span>
                  <span>Reserved</span>
                </div>
                {rows.map((row) => {
                  const component = firstOf(row.component);
                  const location = firstOf(row.location);
                  const lowStock =
                    Number(row.on_hand ?? 0) <
                    Number(component?.reorder_point ?? 0);

                  return (
                    <div key={row.id} className={styles.balanceRow}>
                      <div className={styles.balanceCellMain}>
                        <strong>{component?.name ?? "Unknown component"}</strong>
                        <span>{component?.sku ?? "No SKU"}</span>
                      </div>
                      <div className={styles.balanceCell}>
                        <span>{location?.name ?? "Unassigned"}</span>
                      </div>
                      <div className={styles.balanceCell}>
                        <strong>{row.on_hand}</strong>
                        {lowStock ? (
                          <StatusBadge variant="warning">Below reorder</StatusBadge>
                        ) : null}
                      </div>
                      <div className={styles.balanceCell}>
                        <strong>{row.in_prod}</strong>
                      </div>
                      <div className={styles.balanceCell}>
                        <strong>{row.reserved}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={styles.secondaryColumn}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Latest ledger events</p>
                <h2>Recent movements</h2>
              </div>
            </div>
            {movementRows.length === 0 ? (
              <EmptyState
                title="No movement history yet"
                message="Receipts, allocations, stocktakes, and production completions will appear here."
              />
            ) : (
              <div className={styles.movementList}>
                {movementRows.map((movement) => {
                  const component = firstOf(movement.component);
                  const location = firstOf(movement.location);
                  const hasOnHandDelta = movement.delta_on_hand !== 0;
                  const hasInProdDelta = movement.delta_in_prod !== 0;

                  return (
                    <div key={movement.id} className={styles.movementRow}>
                      <div className={styles.movementTop}>
                        <div>
                          <strong>{component?.name ?? "Unknown component"}</strong>
                          <p>
                            {location?.name ?? "Unassigned"} ·{" "}
                            {new Date(movement.created_at).toLocaleString("en-AU")}
                          </p>
                        </div>
                        <StatusBadge>
                          {movement.reason ?? "movement"}
                        </StatusBadge>
                      </div>
                      <div className={styles.deltaGrid}>
                        <div className={styles.deltaCard}>
                          <span>On hand</span>
                          <strong
                            className={
                              hasOnHandDelta
                                ? movement.delta_on_hand > 0
                                  ? styles.deltaPositive
                                  : styles.deltaNegative
                                : styles.deltaNeutral
                            }
                          >
                            {formatSignedValue(movement.delta_on_hand)}
                          </strong>
                        </div>
                        <div className={styles.deltaCard}>
                          <span>In prod</span>
                          <strong
                            className={
                              hasInProdDelta
                                ? movement.delta_in_prod > 0
                                  ? styles.deltaPositive
                                  : styles.deltaNegative
                                : styles.deltaNeutral
                            }
                          >
                            {formatSignedValue(movement.delta_in_prod)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Current posture</p>
                <h2>Inventory summary</h2>
              </div>
            </div>
            <div className={styles.summaryList}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryDot} />
                <div>
                  <strong>{totalOnHand.toLocaleString()}</strong>
                  <p>Units physically on hand across tracked locations.</p>
                </div>
              </div>
              <div className={styles.summaryItem}>
                <span className={`${styles.summaryDot} ${styles.summaryDotBlue}`} />
                <div>
                  <strong>{totalInProd.toLocaleString()}</strong>
                  <p>Units committed to work in production.</p>
                </div>
              </div>
              <div className={styles.summaryItem}>
                <span className={`${styles.summaryDot} ${styles.summaryDotAmber}`} />
                <div>
                  <strong>{totalReserved.toLocaleString()}</strong>
                  <p>Units reserved by order demand and not freely available.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
