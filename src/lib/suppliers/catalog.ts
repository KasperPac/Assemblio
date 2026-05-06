import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupplierComponentPriceBreak, AvgLeadTime, LeadTimeStatus } from "./types";

export function deriveLeadTimeStatus(
  avgDays: number,
  promisedDays: number
): LeadTimeStatus {
  return avgDays <= promisedDays ? "on-time" : "late";
}

export function resolvePriceForQuantity(
  breaks: SupplierComponentPriceBreak[],
  quantity: number,
  baseUnitCost: number
): number {
  const qualifying = breaks
    .filter((b) => quantity >= b.min_quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity);
  return qualifying[0]?.unit_cost ?? baseUnitCost;
}

type DeliveryReceiptRow = {
  received_at: string;
  purchase_order: { created_at: string } | Array<{ created_at: string }> | null;
  delivery_receipt_line:
    | Array<{ component_id: string }>
    | { component_id: string }
    | null;
};

// Returns avg actual lead time per component for a given supplier.
// Uses delivery_receipt.received_at minus purchase_order.created_at.
// Omits entries with fewer than 3 receipts (insufficient data).
export async function getAvgActualLeadTimes(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string
): Promise<Map<string, AvgLeadTime>> {
  const { data } = await supabase
    .from("delivery_receipt")
    .select(
      "received_at, purchase_order:purchase_order_id(created_at), delivery_receipt_line(component_id)"
    )
    .eq("supplier_id", supplierId)
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null);

  const accum = new Map<string, { totalDays: number; count: number }>();

  for (const row of (data ?? []) as DeliveryReceiptRow[]) {
    if (!row.received_at) continue;
    const po = Array.isArray(row.purchase_order)
      ? row.purchase_order[0]
      : row.purchase_order;
    if (!po) continue;

    const days =
      (new Date(row.received_at).getTime() - new Date(po.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 0) continue;

    const lines = Array.isArray(row.delivery_receipt_line)
      ? row.delivery_receipt_line
      : row.delivery_receipt_line
      ? [row.delivery_receipt_line]
      : [];

    for (const line of lines) {
      const entry = accum.get(line.component_id) ?? { totalDays: 0, count: 0 };
      accum.set(line.component_id, {
        totalDays: entry.totalDays + days,
        count: entry.count + 1,
      });
    }
  }

  const result = new Map<string, AvgLeadTime>();
  for (const [componentId, { totalDays, count }] of accum) {
    if (count < 3) continue;
    const avgDays = totalDays / count;
    result.set(componentId, { componentId, avgDays, sampleCount: count });
  }
  return result;
}

// Returns avg actual lead time per supplier for a given component.
// Used by the component detail page's Suppliers tab.
export async function getAvgActualLeadTimesForComponent(
  supabase: SupabaseClient,
  tenantId: string,
  componentId: string
): Promise<Map<string, AvgLeadTime>> {
  const { data } = await supabase
    .from("delivery_receipt_line")
    .select(
      "delivery_receipt:delivery_receipt_id(received_at, supplier_id, purchase_order:purchase_order_id(created_at))"
    )
    .eq("component_id", componentId)
    .eq("tenant_id", tenantId);

  const accum = new Map<string, { totalDays: number; count: number }>();

  for (const lineRow of data ?? []) {
    const dr = Array.isArray(lineRow.delivery_receipt)
      ? lineRow.delivery_receipt[0]
      : lineRow.delivery_receipt;
    if (!dr?.received_at || !dr.supplier_id) continue;
    const po = Array.isArray(dr.purchase_order) ? dr.purchase_order[0] : dr.purchase_order;
    if (!po) continue;

    const days =
      (new Date(dr.received_at).getTime() - new Date(po.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 0) continue;

    const entry = accum.get(dr.supplier_id) ?? { totalDays: 0, count: 0 };
    accum.set(dr.supplier_id, { totalDays: entry.totalDays + days, count: entry.count + 1 });
  }

  const result = new Map<string, AvgLeadTime>();
  for (const [supplierId, { totalDays, count }] of accum) {
    if (count < 3) continue;
    const avgDays = totalDays / count;
    result.set(supplierId, { componentId, avgDays, sampleCount: count });
  }
  return result;
}
