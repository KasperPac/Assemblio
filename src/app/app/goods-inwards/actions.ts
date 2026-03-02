"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PurchaseOrderLine = {
  id: string;
  component_id: string;
  quantity: number;
  quantity_received: number;
};

type PurchaseOrderRecord = {
  id: string;
  status: string;
};

async function getTenantContext() {
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .single();
  if (!profile?.tenant_id) return null;

  const { data: defaultLocation } = await supabase
    .from("location")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_default", true)
    .maybeSingle();
  if (!defaultLocation?.id) return null;

  return {
    supabase,
    tenantId: profile.tenant_id,
    defaultLocationId: defaultLocation.id,
  };
}

export async function receivePurchaseOrder(formData: FormData) {
  const purchaseOrderId = formData.get("purchase_order_id")?.toString() ?? "";
  if (!purchaseOrderId) return;

  const context = await getTenantContext();
  if (!context) return;
  const { supabase, tenantId, defaultLocationId } = context;

  const { data: purchaseOrder } = await supabase
    .from("purchase_order")
    .select("id,status")
    .eq("id", purchaseOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const typedPo = purchaseOrder as PurchaseOrderRecord | null;
  if (!typedPo?.id) return;
  if (typedPo.status === "received" || typedPo.status === "cancelled") return;

  const { data: lines } = await supabase
    .from("purchase_order_line")
    .select("id,component_id,quantity,quantity_received")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId);

  const poLines = (lines ?? []) as PurchaseOrderLine[];
  if (poLines.length === 0) return;

  let receivedLines = 0;
  let receivedQty = 0;
  for (const line of poLines) {
    const remaining = Number(line.quantity) - Number(line.quantity_received ?? 0);
    if (remaining <= 0) continue;

    const { data: appliedQty, error } = await supabase.rpc(
      "receive_purchase_order_line",
      {
        p_purchase_order_line_id: line.id,
        p_receive_qty: remaining,
        p_location_id: defaultLocationId,
      }
    );
    if (error) {
      return;
    }
    const applied = Number(appliedQty ?? 0);
    if (applied <= 0) continue;

    receivedLines += 1;
    receivedQty += applied;
  }

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "purchase_order_received",
    metadata: {
      purchase_order_id: purchaseOrderId,
      line_count: poLines.length,
      lines_received: receivedLines,
      quantity_received: receivedQty,
      mode: "all_remaining",
    },
  });

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");
}

export async function receivePurchaseOrderLine(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const receiveQtyRaw = Number(formData.get("receive_qty")?.toString() ?? "");
  if (!lineId || !Number.isFinite(receiveQtyRaw) || receiveQtyRaw <= 0) return;

  const context = await getTenantContext();
  if (!context) return;
  const { supabase, tenantId, defaultLocationId } = context;

  const { data: lineData } = await supabase
    .from("purchase_order_line")
    .select("id,purchase_order_id,component_id,quantity,quantity_received")
    .eq("tenant_id", tenantId)
    .eq("id", lineId)
    .maybeSingle();
  const line = lineData as
    | (PurchaseOrderLine & { purchase_order_id: string })
    | null;
  if (!line?.id || !line.purchase_order_id) return;

  const { data: purchaseOrder } = await supabase
    .from("purchase_order")
    .select("id,status")
    .eq("tenant_id", tenantId)
    .eq("id", line.purchase_order_id)
    .maybeSingle();
  const typedPo = purchaseOrder as PurchaseOrderRecord | null;
  if (!typedPo?.id) return;
  if (typedPo.status === "received" || typedPo.status === "cancelled") return;

  const remaining = Number(line.quantity) - Number(line.quantity_received ?? 0);
  const receiveQty = Math.min(receiveQtyRaw, remaining);
  if (receiveQty <= 0) return;

  const { data: appliedQty, error } = await supabase.rpc(
    "receive_purchase_order_line",
    {
      p_purchase_order_line_id: line.id,
      p_receive_qty: receiveQty,
      p_location_id: defaultLocationId,
    }
  );
  if (error) {
    return;
  }
  const applied = Number(appliedQty ?? 0);
  if (applied <= 0) return;

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "purchase_order_line_received",
    metadata: {
      purchase_order_id: line.purchase_order_id,
      purchase_order_line_id: line.id,
      quantity_received: applied,
    },
  });

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");
}
