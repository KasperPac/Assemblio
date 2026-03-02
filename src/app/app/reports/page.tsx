import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./reports.module.css";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";

type BalanceRow = {
  component_id: string;
  location_id: string;
  on_hand: number | null;
  in_prod: number | null;
  reserved: number | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
  component:
    | { name: string | null; sku: string | null; reorder_point: number | null; cost_per_unit: number | null }
    | Array<{
        name: string | null;
        sku: string | null;
        reorder_point: number | null;
        cost_per_unit: number | null;
      }>
    | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: balances },
    { data: profile },
    { count: totalOrders },
    { count: fulfilledOrders },
    { count: cancelledOrders },
    { count: variantsWithActiveBom },
    { count: totalVariants },
    { data: purchaseOrders },
  ] = await Promise.all([
    supabase
      .from("inventory_balance")
      .select(
        "component_id,location_id,on_hand,in_prod,reserved,location:location_id(name),component:component_id(name,sku,reorder_point,cost_per_unit)"
      ),
    supabase.from("profiles").select("tenant_id").single(),
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "fulfilled"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "cancelled"),
    supabase
      .from("product_bom")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("shopify_variant").select("*", { count: "exact", head: true }),
    supabase.from("purchase_order").select("status"),
  ]);

  const balanceRows = (balances ?? []) as BalanceRow[];
  const inventoryValue = balanceRows.reduce((sum, row) => {
    const component = firstOf(row.component);
    return sum + Number(row.on_hand ?? 0) * Number(component?.cost_per_unit ?? 0);
  }, 0);
  const inProductionValue = balanceRows.reduce((sum, row) => {
    const component = firstOf(row.component);
    return sum + Number(row.in_prod ?? 0) * Number(component?.cost_per_unit ?? 0);
  }, 0);
  const lowStock = balanceRows
    .map((row) => {
      const component = firstOf(row.component);
      return {
        name: component?.name ?? "Unknown component",
        sku: component?.sku ?? "--",
        onHand: Number(row.on_hand ?? 0),
        reorderPoint: Number(component?.reorder_point ?? 0),
      };
    })
    .filter((row) => row.onHand < row.reorderPoint)
    .sort((a, b) => a.onHand - b.onHand)
    .slice(0, 5);

  const poStatusCounts = (purchaseOrders ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      const status = (row.status ?? "unknown").toLowerCase();
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const openOrders = Number(totalOrders ?? 0) - Number(fulfilledOrders ?? 0) - Number(cancelledOrders ?? 0);
  const audit = profile?.tenant_id
    ? await loadInventoryIntegrityAudit(
        supabase as unknown as AuditClient,
        profile.tenant_id
      )
    : {
        invariantIssues: [],
        reconciliationIssues: [],
        duplicateAllocationKeys: [],
        poOverReceipt: [],
      };
  const invariantIssues = audit.invariantIssues;
  const reconciliationIssues = audit.reconciliationIssues;
  const duplicateAllocationKeys = audit.duplicateAllocationKeys;
  const poOverReceipt = audit.poOverReceipt;
  const bomCoveragePct =
    Number(totalVariants ?? 0) === 0
      ? 0
      : Math.round((Number(variantsWithActiveBom ?? 0) / Number(totalVariants ?? 0)) * 100);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Reports</h1>
          <p>Operational reporting across inventory and orders</p>
        </div>
        <a className={styles.primary} href="/app/reports/export">
          Export Snapshot (CSV)
        </a>
      </div>
      <div className={styles.kpiGrid}>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Inventory Value (On-hand)</p>
          <h3>{formatCurrency(inventoryValue)}</h3>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Inventory Value (In production)</p>
          <h3>{formatCurrency(inProductionValue)}</h3>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>BOM Coverage</p>
          <h3>{bomCoveragePct}%</h3>
          <span>
            {variantsWithActiveBom ?? 0} / {totalVariants ?? 0} variants with active BOM
          </span>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Order Health</p>
          <h3>{openOrders}</h3>
          <span>
            {fulfilledOrders ?? 0} fulfilled, {cancelledOrders ?? 0} cancelled
          </span>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Inventory Integrity</p>
          <h3>{invariantIssues.length === 0 ? "Healthy" : `${invariantIssues.length} issues`}</h3>
          <span>
            {invariantIssues.length === 0
              ? "No invariant violations detected."
              : "Negative balances or over-reservations detected."}
          </span>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Ledger Reconciliation</p>
          <h3>{reconciliationIssues.length === 0 ? "Matched" : `${reconciliationIssues.length} drifts`}</h3>
          <span>
            {reconciliationIssues.length === 0
              ? "Balance and movement totals are aligned."
              : "Balance totals differ from movement aggregates."}
          </span>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Allocation Integrity</p>
          <h3>
            {duplicateAllocationKeys.length === 0
              ? "Unique"
              : `${duplicateAllocationKeys.length} duplicates`}
          </h3>
          <span>
            {duplicateAllocationKeys.length === 0
              ? "No duplicate (order_line, component) keys."
              : "Duplicate allocation keys detected."}
          </span>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>PO Receipt Integrity</p>
          <h3>{poOverReceipt.length === 0 ? "Valid" : `${poOverReceipt.length} invalid`}</h3>
          <span>
            {poOverReceipt.length === 0
              ? "No over-receipt lines detected."
              : "PO lines exceed ordered quantity."}
          </span>
        </article>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Low Stock Components</h3>
          {lowStock.length === 0 ? (
            <p>All components are at or above reorder point.</p>
          ) : (
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span>Component</span>
                <span>SKU</span>
                <span>On-hand</span>
                <span>Reorder</span>
              </div>
              {lowStock.map((row) => (
                <div key={`${row.sku}-${row.name}`} className={styles.tableRow}>
                  <span>{row.name}</span>
                  <span>{row.sku}</span>
                  <span>{row.onHand}</span>
                  <span>{row.reorderPoint}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.card}>
          <h3>Purchase Order Mix</h3>
          <div className={styles.statusList}>
            <p>Open: {poStatusCounts.open ?? 0}</p>
            <p>In transit: {poStatusCounts.in_transit ?? 0}</p>
            <p>Received: {poStatusCounts.received ?? 0}</p>
            <p>Cancelled: {poStatusCounts.cancelled ?? 0}</p>
          </div>
          <p className={styles.cardFootnote}>
            Use this to spot inbound bottlenecks before they impact allocations.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <h3>Inventory Integrity Checks</h3>
        {invariantIssues.length === 0 ? (
          <p>No invariants currently violated.</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeaderIntegrity}>
              <span>Type</span>
              <span>Component</span>
              <span>Location</span>
              <span>Detail</span>
            </div>
            {invariantIssues.slice(0, 10).map((issue) => (
              <div key={`${issue.type}-${issue.componentName}-${issue.locationName}-${issue.detail}`} className={styles.tableRowIntegrity}>
                <span>{issue.type}</span>
                <span>{issue.componentName}</span>
                <span>{issue.locationName}</span>
                <span>{issue.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.card}>
        <h3>Ledger Reconciliation Drift</h3>
        {reconciliationIssues.length === 0 ? (
          <p>No balance-vs-movement drift detected.</p>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHeaderDrift}>
              <span>Component</span>
              <span>Location</span>
              <span>On-hand (bal / mov / delta)</span>
              <span>In prod (bal / mov / delta)</span>
            </div>
            {reconciliationIssues.slice(0, 10).map((issue) => (
              <div
                key={`${issue.componentId}-${issue.locationId}`}
                className={styles.tableRowDrift}
              >
                <span>{issue.componentName}</span>
                <span>{issue.locationName}</span>
                <span>
                  {issue.onHandBalance.toFixed(2)} / {issue.onHandMovement.toFixed(2)} /{" "}
                  {issue.onHandDelta.toFixed(2)}
                </span>
                <span>
                  {issue.inProdBalance.toFixed(2)} / {issue.inProdMovement.toFixed(2)} /{" "}
                  {issue.inProdDelta.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.card}>
        <h3>Allocation/Receipt Integrity</h3>
        {duplicateAllocationKeys.length === 0 && poOverReceipt.length === 0 ? (
          <p>No duplicate allocation keys or PO over-receipt rows detected.</p>
        ) : (
          <div className={styles.statusList}>
            <p>Duplicate allocation keys: {duplicateAllocationKeys.length}</p>
            <p>PO over-receipt rows: {poOverReceipt.length}</p>
          </div>
        )}
      </div>
    </div>
  );
}
