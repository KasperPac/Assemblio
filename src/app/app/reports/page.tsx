import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";
import styles from "./reports.module.css";

export default async function ReportsHubPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

  const [
    balancesRes,
    movCountRes,
    allMovsRes,
    stocktakeCountRes,
    lastStocktakeRes,
    openPOsRes,
    supplierSpendRes,
    receiptsRes,
    discrepancyRes,
  ] = await Promise.all([
    supabase
      .from("inventory_balance")
      .select("component_id,on_hand,component:component_id(cost_per_unit)")
      .eq("tenant_id", tenantId)
      .gt("on_hand", 0),
    supabase
      .from("inventory_movement")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", cutoff30d),
    supabase
      .from("inventory_movement")
      .select("component_id,created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", cutoff90d),
    supabase
      .from("stocktake_session")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("stocktake_session")
      .select("created_at,status")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("purchase_order")
      .select("id,expected_date,status,lines:purchase_order_line(quantity,unit_cost)")
      .eq("tenant_id", tenantId)
      .not("status", "in", '("received","cancelled")'),
    supabase
      .from("purchase_order")
      .select("supplier_id,lines:purchase_order_line(quantity,unit_cost)")
      .eq("tenant_id", tenantId)
      .gte("created_at", startOfYear),
    supabase
      .from("delivery_receipt")
      .select("received_at,purchase_order:purchase_order_id(expected_date)")
      .eq("tenant_id", tenantId)
      .not("purchase_order_id", "is", null)
      .gte("received_at", cutoff90d),
    supabase
      .from("delivery_receipt")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "discrepancy"),
  ]);

  const integrity = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    tenantId
  );

  type BalanceRow = {
    component_id: string;
    on_hand: number;
    component: { cost_per_unit?: number } | null;
  };
  type MovRow = { component_id: string; created_at: string };
  type StocktakeRow = { created_at: string; status: string };
  type PORow = {
    id: string;
    expected_date: string | null;
    status: string;
    lines: { quantity: number; unit_cost: number }[];
  };
  type SpendRow = {
    supplier_id: string;
    lines: { quantity: number; unit_cost: number }[];
  };
  type ReceiptRow = {
    received_at: string;
    purchase_order: { expected_date?: string } | null;
  };

  // Inventory stats
  const balances = (balancesRes.data ?? []) as BalanceRow[];
  const totalValue = balances.reduce((sum: number, b: BalanceRow) => {
    const cost = b.component?.cost_per_unit ?? 0;
    return sum + b.on_hand * cost;
  }, 0);

  const movCount = movCountRes.count ?? 0;

  const activeComponentIds = new Set(
    ((allMovsRes.data ?? []) as MovRow[]).map((m: MovRow) => m.component_id)
  );
  const deadBalances = balances.filter((b: BalanceRow) => !activeComponentIds.has(b.component_id));
  const deadCount = deadBalances.length;
  const deadValue = deadBalances.reduce((sum: number, b: BalanceRow) => {
    const cost = b.component?.cost_per_unit ?? 0;
    return sum + b.on_hand * cost;
  }, 0);

  const stocktakeTotal = stocktakeCountRes.count ?? 0;
  const lastStocktake = ((lastStocktakeRes.data ?? []) as StocktakeRow[])[0];
  const lastStocktakeDaysAgo = lastStocktake
    ? Math.floor((now.getTime() - new Date(lastStocktake.created_at).getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // Purchasing stats
  const openPOs = (openPOsRes.data ?? []) as PORow[];
  const openLiability = openPOs.reduce((sum: number, po: PORow) => {
    const lines = po.lines ?? [];
    return sum + lines.reduce((s: number, l: { quantity: number; unit_cost: number }) => s + l.quantity * (l.unit_cost ?? 0), 0);
  }, 0);
  const overduePOs = openPOs.filter(
    (po: PORow) => po.expected_date && new Date(po.expected_date) < now
  ).length;

  const yearSpend = ((supplierSpendRes.data ?? []) as SpendRow[]).reduce((sum: number, po: SpendRow) => {
    const lines = po.lines ?? [];
    return sum + lines.reduce((s: number, l: { quantity: number; unit_cost: number }) => s + l.quantity * (l.unit_cost ?? 0), 0);
  }, 0);
  const supplierCount = new Set(((supplierSpendRes.data ?? []) as SpendRow[]).map((po: SpendRow) => po.supplier_id)).size;

  const receipts = (receiptsRes.data ?? []) as ReceiptRow[];
  const onTimeReceipts = receipts.filter((r: ReceiptRow) => {
    const po = r.purchase_order;
    if (!po?.expected_date) return true;
    return new Date(r.received_at) <= new Date(po.expected_date);
  });
  const onTimePct = receipts.length > 0
    ? Math.round((onTimeReceipts.length / receipts.length) * 100)
    : 100;
  const discrepancyCount = discrepancyRes.count ?? 0;

  // System stats
  const totalIssues =
    integrity.invariantIssues.length +
    integrity.reconciliationIssues.length +
    integrity.duplicateAllocationKeys.length +
    integrity.poOverReceipt.length;

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
      notation: n >= 100_000 ? "compact" : "standard",
    }).format(n);

  return (
    <div className={styles.page}>
      <p className={styles.pageDesc}>
        Live data across inventory, purchasing, and system health.
      </p>

      {/* INVENTORY */}
      <div className={styles.section}>
        <span className={`${styles.sectionLabel} ${styles.sectionLabelInventory}`}>
          Inventory
        </span>
        <div className={styles.grid}>
          <Link href="/app/reports/stock-on-hand" className={styles.card}>
            <div className={styles.cardName}>Stock on hand</div>
            <div className={styles.cardValue}>{balances.length}</div>
            <div className={styles.cardSub}>{fmtCurrency(totalValue)} total value</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/movements" className={styles.card}>
            <div className={styles.cardName}>Movements ledger</div>
            <div className={styles.cardValue}>{movCount}</div>
            <div className={styles.cardSub}>movements in last 30 days</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/valuation" className={styles.card}>
            <div className={styles.cardName}>Inventory valuation</div>
            <div className={styles.cardValue}>{fmtCurrency(totalValue)}</div>
            <div className={styles.cardSub}>current on-hand value</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link
            href="/app/reports/dead-stock"
            className={`${styles.card} ${deadCount > 0 ? styles.cardAmber : ""}`}
          >
            <div className={`${styles.cardName} ${deadCount > 0 ? styles.cardNameAmber : ""}`}>
              Dead stock
            </div>
            <div className={`${styles.cardValue} ${deadCount > 0 ? styles.cardValueAmber : ""}`}>
              {deadCount > 0 ? `${deadCount} components` : "None"}
            </div>
            <div className={`${styles.cardSub} ${deadCount > 0 ? styles.cardSubAmber : ""}`}>
              {deadCount > 0 ? `${fmtCurrency(deadValue)} tied up · no demand 90d` : "No idle stock"}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/stocktake-history" className={styles.card}>
            <div className={styles.cardName}>Stocktake history</div>
            <div className={styles.cardValue}>{stocktakeTotal}</div>
            <div className={styles.cardSub}>
              {lastStocktakeDaysAgo != null
                ? `last: ${lastStocktakeDaysAgo} day${lastStocktakeDaysAgo === 1 ? "" : "s"} ago`
                : "No stocktakes yet"}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>
        </div>
      </div>

      {/* PURCHASING */}
      <div className={styles.section}>
        <span className={`${styles.sectionLabel} ${styles.sectionLabelPurchasing}`}>
          Purchasing
        </span>
        <div className={styles.grid}>
          <Link
            href="/app/reports/po-summary"
            className={`${styles.card} ${overduePOs > 0 ? styles.cardRed : ""}`}
          >
            <div className={`${styles.cardName} ${overduePOs > 0 ? styles.cardNameRed : ""}`}>
              PO summary
            </div>
            <div className={`${styles.cardValue} ${overduePOs > 0 ? styles.cardValueRed : ""}`}>
              {fmtCurrency(openLiability)}
            </div>
            <div className={`${styles.cardSub} ${overduePOs > 0 ? styles.cardSubRed : ""}`}>
              open liability
              {overduePOs > 0
                ? ` · ${overduePOs} overdue`
                : ` · ${openPOs.length} POs outstanding`}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link href="/app/reports/spend-by-supplier" className={styles.card}>
            <div className={styles.cardName}>Spend by supplier</div>
            <div className={styles.cardValue}>{fmtCurrency(yearSpend)}</div>
            <div className={styles.cardSub}>this year · {supplierCount} suppliers</div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link
            href="/app/reports/lead-time-accuracy"
            className={`${styles.card} ${onTimePct < 80 ? styles.cardRed : ""}`}
          >
            <div className={`${styles.cardName} ${onTimePct < 80 ? styles.cardNameRed : ""}`}>
              Lead time accuracy
            </div>
            <div
              className={`${styles.cardValue} ${
                onTimePct < 80
                  ? styles.cardValueRed
                  : onTimePct >= 95
                  ? styles.cardValueGreen
                  : ""
              }`}
            >
              {onTimePct}%
            </div>
            <div className={`${styles.cardSub} ${onTimePct < 80 ? styles.cardSubRed : ""}`}>
              on-time deliveries · last 90 days
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>

          <Link
            href="/app/reports/po-variance"
            className={`${styles.card} ${discrepancyCount > 0 ? styles.cardAmber : ""}`}
          >
            <div
              className={`${styles.cardName} ${discrepancyCount > 0 ? styles.cardNameAmber : ""}`}
            >
              PO quantity variance
            </div>
            <div
              className={`${styles.cardValue} ${discrepancyCount > 0 ? styles.cardValueAmber : ""}`}
            >
              {discrepancyCount > 0 ? `${discrepancyCount} lines` : "None"}
            </div>
            <div
              className={`${styles.cardSub} ${discrepancyCount > 0 ? styles.cardSubAmber : ""}`}
            >
              received ≠ ordered
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>
        </div>
      </div>

      {/* SYSTEM */}
      <div className={styles.section}>
        <span className={`${styles.sectionLabel} ${styles.sectionLabelSystem}`}>
          System
        </span>
        <div className={styles.grid}>
          <Link
            href="/app/reports/inventory-integrity"
            className={`${styles.card} ${totalIssues > 0 ? styles.cardRed : ""}`}
          >
            <div
              className={`${styles.cardName} ${totalIssues > 0 ? styles.cardNameRed : ""}`}
            >
              Inventory integrity
            </div>
            <div
              className={`${styles.cardValue} ${
                totalIssues > 0 ? styles.cardValueRed : styles.cardValueGreen
              }`}
            >
              {totalIssues > 0 ? `${totalIssues} issues` : "Healthy"}
            </div>
            <div
              className={`${styles.cardSub} ${totalIssues > 0 ? styles.cardSubRed : ""}`}
            >
              {totalIssues > 0 ? "action required" : "0 issues · checked now"}
            </div>
            <div className={styles.cardLink}>View report →</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
