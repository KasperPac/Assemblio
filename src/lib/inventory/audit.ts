import { findInventoryInvariantIssues } from "./invariants";
import { reconcileInventoryBalances } from "./reconciliation";

export type AuditClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: unknown;
      }>;
    };
  };
};

type AuditBalanceRow = {
  component_id: string;
  location_id: string;
  on_hand: number | null;
  in_prod: number | null;
  reserved: number | null;
  component: { name: string | null } | Array<{ name: string | null }> | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export async function loadInventoryIntegrityAudit(
  client: AuditClient,
  tenantId: string
) {
  const [{ data: balances }, { data: movements }, { data: allocations }, { data: poLines }] =
    await Promise.all([
      client
        .from("inventory_balance")
        .select(
          "component_id,location_id,on_hand,in_prod,reserved,component:component_id(name),location:location_id(name)"
        )
        .eq("tenant_id", tenantId),
      client
        .from("inventory_movement")
        .select("component_id,location_id,delta_on_hand,delta_in_prod")
        .eq("tenant_id", tenantId),
      client
        .from("order_component_allocation")
        .select("order_line_id,component_id")
        .eq("tenant_id", tenantId),
      client
        .from("purchase_order_line")
        .select("id,quantity,quantity_received")
        .eq("tenant_id", tenantId),
    ]);

  const balanceRows = (balances ?? []) as AuditBalanceRow[];
  const invariantIssues = findInventoryInvariantIssues(
    balanceRows.map((row) => ({
      componentName: firstOf(row.component)?.name ?? "Unknown component",
      locationName: firstOf(row.location)?.name ?? "Unknown location",
      onHand: Number(row.on_hand ?? 0),
      inProd: Number(row.in_prod ?? 0),
      reserved: Number(row.reserved ?? 0),
    }))
  );

  const reconciliationIssues = reconcileInventoryBalances(
    balanceRows.map((row) => ({
      componentId: row.component_id,
      locationId: row.location_id,
      componentName: firstOf(row.component)?.name ?? "Unknown component",
      locationName: firstOf(row.location)?.name ?? "Unknown location",
      onHand: Number(row.on_hand ?? 0),
      inProd: Number(row.in_prod ?? 0),
    })),
    (movements ?? []).map((row) => ({
      componentId: String(row.component_id ?? ""),
      locationId: String(row.location_id ?? ""),
      deltaOnHand: Number(row.delta_on_hand ?? 0),
      deltaInProd: Number(row.delta_in_prod ?? 0),
    }))
  );

  const allocationKeyCounts = new Map<string, number>();
  for (const row of allocations ?? []) {
    const key = `${row.order_line_id}:${row.component_id}`;
    allocationKeyCounts.set(key, (allocationKeyCounts.get(key) ?? 0) + 1);
  }
  const duplicateAllocationKeys = Array.from(allocationKeyCounts.entries()).filter(
    ([, count]) => count > 1
  );

  const poOverReceipt = (poLines ?? []).filter(
    (line) => Number(line.quantity_received ?? 0) > Number(line.quantity ?? 0)
  );

  return {
    invariantIssues,
    reconciliationIssues,
    duplicateAllocationKeys,
    poOverReceipt,
  };
}
