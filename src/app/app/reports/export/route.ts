import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";

type ExportBalanceRow = {
  on_hand: number | null;
  in_prod: number | null;
  reserved: number | null;
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

function csvCell(value: unknown) {
  const cell = String(value ?? "");
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

export async function GET() {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const [
    { data: balances, error: balancesError },
    { count: totalOrders },
    { count: fulfilledOrders },
    { count: cancelledOrders },
    { count: variantsWithActiveBom },
    { count: totalVariants },
    { data: purchaseOrders },
  ] = await Promise.all([
    supabase
      .from("inventory_balance")
      .select("on_hand,in_prod,reserved,component:component_id(name,sku,reorder_point,cost_per_unit)")
      .eq("tenant_id", tenantId),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "fulfilled"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "cancelled"),
    supabase
      .from("product_bom")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    supabase
      .from("shopify_variant")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("purchase_order")
      .select("status")
      .eq("tenant_id", tenantId),
  ]);

  if (balancesError) {
    return NextResponse.json({ error: balancesError.message }, { status: 500 });
  }

  const audit = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    tenantId
  );
  const balanceRows = (balances ?? []) as ExportBalanceRow[];
  const inventoryValue = balanceRows.reduce((sum, row) => {
    const component = firstOf(row.component);
    return sum + Number(row.on_hand ?? 0) * Number(component?.cost_per_unit ?? 0);
  }, 0);
  const inProductionValue = balanceRows.reduce((sum, row) => {
    const component = firstOf(row.component);
    return sum + Number(row.in_prod ?? 0) * Number(component?.cost_per_unit ?? 0);
  }, 0);
  const bomCoveragePct =
    Number(totalVariants ?? 0) === 0
      ? 0
      : Math.round((Number(variantsWithActiveBom ?? 0) / Number(totalVariants ?? 0)) * 100);
  const openOrders =
    Number(totalOrders ?? 0) - Number(fulfilledOrders ?? 0) - Number(cancelledOrders ?? 0);
  const poStatusCounts = (purchaseOrders ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      const status = String(row.status ?? "unknown").toLowerCase();
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const rows: Array<Array<string | number>> = [
    ["section", "key", "value", "detail"],
    ["meta", "generated_at", new Date().toISOString(), ""],
    ["meta", "tenant_id", tenantId, ""],
    ["kpi", "inventory_value_on_hand", inventoryValue.toFixed(2), "AUD"],
    ["kpi", "inventory_value_in_production", inProductionValue.toFixed(2), "AUD"],
    ["kpi", "bom_coverage_pct", bomCoveragePct, ""],
    ["kpi", "open_orders", openOrders, ""],
    ["kpi", "purchase_orders_open", poStatusCounts.open ?? 0, ""],
    ["kpi", "purchase_orders_in_transit", poStatusCounts.in_transit ?? 0, ""],
    ["kpi", "purchase_orders_received", poStatusCounts.received ?? 0, ""],
    ["kpi", "purchase_orders_cancelled", poStatusCounts.cancelled ?? 0, ""],
    ["integrity_summary", "invariant_issues", audit.invariantIssues.length, ""],
    ["integrity_summary", "reconciliation_drifts", audit.reconciliationIssues.length, ""],
    ["integrity_summary", "duplicate_allocation_keys", audit.duplicateAllocationKeys.length, ""],
    ["integrity_summary", "po_over_receipt_rows", audit.poOverReceipt.length, ""],
  ];

  for (const issue of audit.invariantIssues.slice(0, 200)) {
    rows.push([
      "integrity_issue",
      issue.type,
      `${issue.componentName} @ ${issue.locationName}`,
      issue.detail,
    ]);
  }

  for (const issue of audit.reconciliationIssues.slice(0, 200)) {
    rows.push([
      "reconciliation_drift",
      `${issue.componentName} @ ${issue.locationName}`,
      `on_hand_delta=${issue.onHandDelta.toFixed(2)};in_prod_delta=${issue.inProdDelta.toFixed(2)}`,
      "",
    ]);
  }

  for (const [key, count] of audit.duplicateAllocationKeys.slice(0, 200)) {
    rows.push(["allocation_duplicate", key, count, ""]);
  }

  for (const row of audit.poOverReceipt.slice(0, 200)) {
    rows.push([
      "po_over_receipt",
      String(row.id ?? ""),
      `received=${Number(row.quantity_received ?? 0)}`,
      `ordered=${Number(row.quantity ?? 0)}`,
    ]);
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=reports-${dateStamp}.csv`,
    },
  });
}
