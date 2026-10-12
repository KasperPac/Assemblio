import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import type { SquareConnectionRow } from "./connection";

export type SquareOrder = { id: string; location_id: string; state: string; closed_at?: string; created_at?: string;
  line_items?: Array<{ uid: string; catalog_object_id?: string; name?: string; quantity: string;
    base_price_money?: { amount: number; currency?: string }; total_money?: { amount: number; currency?: string }; total_tax_money?: { amount: number; currency?: string } }> };

export function squareOrderInput(order: SquareOrder, expectedCurrency = "AUD") {
  if (order.state !== "COMPLETED") return null;
  if (!order.id || !order.location_id || !order.closed_at || !Number.isFinite(Date.parse(order.closed_at))) throw new Error("Completed Square order is missing its identity or completion date");
  const lines = (order.line_items ?? []).map((line) => {
    for (const money of [line.base_price_money, line.total_money, line.total_tax_money]) if (money?.currency && money.currency !== expectedCurrency) throw new Error("Square sale currency does not match the workspace");
    const quantity = Number(line.quantity);
    if (!line.uid || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Square order has an invalid line quantity or identity");
    const unit = line.base_price_money?.amount ?? 0;
    const total = (line.total_money?.amount ?? unit * quantity) - (line.total_tax_money?.amount ?? 0);
    if (!Number.isFinite(unit) || !Number.isFinite(total)) throw new Error("Square order has an invalid line amount");
    return { uid: line.uid, catalog_object_id: line.catalog_object_id ?? null, name: line.name ?? "Square sale", quantity, unit_sell_price: unit / 100, line_sell_price: total / 100 };
  });
  return { p_external_order_id: order.id, p_square_location_id: order.location_id, p_lines: lines, p_payload: { state: order.state, closed_at: order.closed_at, created_at: order.created_at ?? order.closed_at } };
}

export async function ingestSquareOrder(db: SupabaseClient, connection: SquareConnectionRow, order: SquareOrder, leaseToken?: string, expectedCurrency = "AUD"): Promise<string | null> {
  const input = squareOrderInput(order, expectedCurrency);
  if (!input) return null;
  const { data, error } = await db.rpc("ingest_square_order", { p_tenant_id: connection.tenant_id, p_sales_channel_id: connection.sales_channel_id, ...input, p_lease_token: leaseToken ?? null });
  assertNoError(error, "Ingest Square order");
  if (typeof data !== "string") throw new Error("Square order was not persisted");
  return data;
}
