import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { squareFetch } from "./client";
import type { SquareSyncConnection, SquareSyncAccess } from "./sync";

export function squareAvailableStock(onHand: number, reserved: number): number {
  if (!Number.isFinite(onHand) || !Number.isFinite(reserved) || reserved < 0) throw new Error("Invalid Manuva stock balance");
  return Math.max(0, onHand - reserved);
}

type StockLink = { id: string; variant_id: string; external_variation_id: string; tracked_location_ids: string[] };
type Write = { id: string; quantity: number; status: string; attempts: number; lease_until: string | null; created_at: string };

/** Send only the current available balance; Square never receives negative stock. */
export async function pushSquareStock(db: SupabaseClient, conn: SquareSyncConnection, access: SquareSyncAccess) {
  const { data: pending, error: pendingError } = await db.from("square_order_line").select("id,orders!inner(historical)").eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id)
    .eq("status", "pending_mapping").eq("orders.historical", false).limit(1);
  assertNoError(pendingError, "Check pending Square sales");
  if (pending?.length) return;
  const { data: events, error: eventError } = await db.from("square_webhook_event").select("id").eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id)
    .in("event_type", ["order.created", "order.updated", "order.fulfillment.updated", "inventory.count.updated"]).neq("status", "processed").limit(1);
  assertNoError(eventError, "Check unprocessed Square notifications");
  if (events?.length) return;
  const links: StockLink[] = [];
  for (let offset = 0; ; offset += 500) {
    if (access.deadline && Date.now() >= access.deadline) throw new Error("Square sync time budget exceeded");
    const { data, error } = await db.from("channel_item_link").select("id,variant_id,external_variation_id,tracked_location_ids")
      .eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id).eq("status", "linked").is("stock_conversion_ratio", null).order("id").range(offset, offset + 499);
    assertNoError(error, "Read Square stock links"); links.push(...(data ?? []) as StockLink[]);
    if ((data?.length ?? 0) < 500) break;
  }
  const { data: locations, error: locationError } = await db.from("square_location_link").select("square_location_id,location_id").eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id);
  assertNoError(locationError, "Read stock locations");
  for (const link of links) for (const location of locations ?? []) {
    if (access.deadline && Date.now() >= access.deadline) throw new Error("Square sync time budget exceeded");
    if (!link.tracked_location_ids.includes(location.square_location_id)) continue;
    const { data: channel, error: channelError } = await db.from("sales_channel").select("stock_write_enabled,baseline_confirmed_at,sync_lease_token,sync_lease_until").eq("tenant_id", conn.tenant_id).eq("id", conn.sales_channel_id).single();
    assertNoError(channelError, "Recheck Square stock permission");
    if (!channel?.stock_write_enabled || !channel.baseline_confirmed_at) return;
    const leaseExpiry = Date.parse(channel.sync_lease_until ?? "");
    if (!access.leaseToken || channel.sync_lease_token !== access.leaseToken || !Number.isFinite(leaseExpiry) || leaseExpiry <= Date.now()) throw new Error("Square reconciliation lease expired");
    const { data: bom, error: bomError } = await db.from("product_bom").select("id").eq("tenant_id", conn.tenant_id).eq("variant_id", link.variant_id).eq("is_active", true).maybeSingle();
    assertNoError(bomError, "Read retail BOM");
    if (!bom) throw new Error("Linked Square retail variant has no active BOM");
    const { data: components, error: componentError } = await db.from("product_bom_component").select("component_id,quantity").eq("tenant_id", conn.tenant_id).eq("product_bom_id", bom.id);
    assertNoError(componentError, "Read retail component");
    if (components?.length !== 1 || Number(components[0].quantity) !== 1) throw new Error("Square retail stock requires a single component at quantity one");
    const { data: balance, error: balanceError } = await db.from("inventory_balance").select("on_hand,reserved").eq("tenant_id", conn.tenant_id).eq("component_id", components[0].component_id).eq("location_id", location.location_id).maybeSingle();
    assertNoError(balanceError, "Read available stock");
    const quantity = squareAvailableStock(Number(balance?.on_hand ?? 0), Number(balance?.reserved ?? 0));
    const { data: previous, error: previousError } = await db.from("channel_stock_write").select("id,quantity,status,attempts,lease_until,created_at")
      .eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id).eq("external_variation_id", link.external_variation_id).eq("external_location_id", location.square_location_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    assertNoError(previousError, "Read previous stock write");
    let write = previous as Write | null;
    if (write?.status === "processing" && write.lease_until && Date.parse(write.lease_until) > Date.now()) throw new Error("Square stock write is still processing");
    if (write?.status === "sent" && Number(write.quantity) === quantity) continue;
    if (!write || Number(write.quantity) !== quantity || write.status === "sent") {
      const { data, error } = await db.from("channel_stock_write").insert({ tenant_id: conn.tenant_id, sales_channel_id: conn.sales_channel_id, variant_id: link.variant_id,
        external_variation_id: link.external_variation_id, external_location_id: location.square_location_id, quantity }).select("id,quantity,status,attempts,lease_until,created_at").single();
      assertNoError(error, "Queue Square stock write"); write = data as Write;
    }
    const lease = new Date(Date.now() + 60_000).toISOString();
    const { data: claimed, error: claimError } = await db.from("channel_stock_write").update({ status: "processing", attempts: write.attempts + 1, lease_until: lease, updated_at: new Date().toISOString() })
      .eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id).eq("id", write.id).eq("attempts", write.attempts).select("id");
    assertNoError(claimError, "Claim Square stock write");
    if (!claimed?.length) throw new Error("Square stock write was claimed elsewhere");
    if (access.deadline && Date.now() >= access.deadline) throw new Error("Square sync time budget exceeded");
    const { data: permission, error: permissionError } = await db.from("sales_channel").select("stock_write_enabled,sync_lease_token,sync_lease_until").eq("tenant_id", conn.tenant_id).eq("id", conn.sales_channel_id).single();
    assertNoError(permissionError, "Fence Square stock write");
    const finalExpiry = Date.parse(permission?.sync_lease_until ?? "");
    if (!permission?.stock_write_enabled || permission.sync_lease_token !== access.leaseToken || !Number.isFinite(finalExpiry) || finalExpiry <= Date.now()) throw new Error("Square stock write permission or lease changed");
    const { data: newEvents, error: newEventError } = await db.from("square_webhook_event").select("id").eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id)
      .in("event_type", ["order.created", "order.updated", "order.fulfillment.updated", "inventory.count.updated"]).neq("status", "processed").limit(1);
    assertNoError(newEventError, "Fence Square notifications before stock write");
    if (newEvents?.length) throw new Error("New Square notifications must be reconciled before stock writes");
    if (access.deadline && Date.now() >= access.deadline) throw new Error("Square sync time budget exceeded");
    const result = await squareFetch<{ counts?: Array<{ catalog_object_id: string; location_id: string; quantity: string; calculated_at: string }> }>(access, "/v2/inventory/changes/batch-create", { method: "POST", body: {
      idempotency_key: write.id, ignore_unchanged_counts: true, changes: [{ type: "PHYSICAL_COUNT", physical_count: { catalog_object_id: link.external_variation_id,
        location_id: location.square_location_id, state: "IN_STOCK", quantity: String(quantity), occurred_at: write.created_at } }] } });
    const count = result.ok ? result.data.counts?.find((entry) => entry.catalog_object_id === link.external_variation_id && entry.location_id === location.square_location_id && Number(entry.quantity) === quantity) : undefined;
    const { error: savedError } = await db.from("channel_stock_write").update({ status: result.ok ? "sent" : "failed", lease_until: result.ok ? null : new Date(Date.now() + 60_000).toISOString(),
      square_calculated_at: count?.calculated_at ?? null, updated_at: new Date().toISOString() }).eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id).eq("id", write.id).eq("lease_until", lease);
    assertNoError(savedError, "Record Square stock write result");
    if (!result.ok) throw new Error(`Square stock write failed (${result.errorClass}:${result.code})`);
  }
}
