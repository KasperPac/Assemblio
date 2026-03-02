"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

type PurchasingState = {
  error?: string;
  success?: string;
};

function parseNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createPurchaseOrder(
  _prevState: PurchasingState,
  formData: FormData
): Promise<PurchasingState> {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "open";
  if (!supplierId) {
    return { error: "Supplier is required." };
  }

  const context = await getServerTenantContext();
  if (!context) {
    return { error: "Missing tenant context." };
  }
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("purchase_order").insert({
    tenant_id: tenantId,
    supplier_id: supplierId,
    status,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/app/purchasing");
  revalidatePath("/app/goods-inwards");
  return { success: "Purchase order created." };
}

export async function updatePurchaseOrderStatus(formData: FormData) {
  const purchaseOrderId = formData.get("purchase_order_id")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";
  if (!purchaseOrderId || !status) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("purchase_order")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", purchaseOrderId);

  revalidatePath("/app/purchasing");
  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/trash");
}

export async function createPurchaseOrderLine(
  _prevState: PurchasingState,
  formData: FormData
): Promise<PurchasingState> {
  const purchaseOrderId = formData.get("purchase_order_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const quantity = parseNumber(formData.get("quantity"));
  if (!purchaseOrderId || !componentId || quantity === null) {
    return { error: "PO, component, and quantity are required." };
  }

  const context = await getServerTenantContext();
  if (!context) {
    return { error: "Missing tenant context." };
  }
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("purchase_order_line").insert({
    tenant_id: tenantId,
    purchase_order_id: purchaseOrderId,
    component_id: componentId,
    quantity,
    quantity_received: 0,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/purchasing");
  return { success: "PO line added." };
}

export async function updatePurchaseOrderLineQuantity(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const quantity = parseNumber(formData.get("quantity"));
  if (!lineId || quantity === null) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: line } = await supabase
    .from("purchase_order_line")
    .select("id,quantity_received")
    .eq("tenant_id", tenantId)
    .eq("id", lineId)
    .maybeSingle();
  const received = Number(line?.quantity_received ?? 0);
  if (!line?.id || quantity < received) return;

  await supabase
    .from("purchase_order_line")
    .update({ quantity })
    .eq("tenant_id", tenantId)
    .eq("id", lineId);
  revalidatePath("/app/purchasing");
}
