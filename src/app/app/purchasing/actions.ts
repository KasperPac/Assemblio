"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { logActivity } from "@/lib/activity/log";

type PurchasingState = {
  error?: string;
  success?: string;
};

function parseNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Increment trailing digits in a PO number, e.g. "PO-2506001" → "PO-2506002" */
function incrementPoNumber(last: string | null): string {
  if (!last) return "PO-001";
  const match = last.match(/^(.*?)(\d+)$/);
  if (!match) return `${last}-2`;
  const [, prefix, digits] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${prefix}${next}`;
}

/** Called by the create form to suggest the next PO number. */
export async function getNextPoNumber(): Promise<string> {
  const context = await getServerTenantContext();
  if (!context?.tenantId) return "PO-001";
  const { supabase, tenantId } = context;

  const { data: latest } = await supabase
    .from("purchase_order")
    .select("po_number")
    .eq("tenant_id", tenantId)
    .not("po_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return incrementPoNumber(latest?.po_number ?? null);
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

  // Use provided PO number, or auto-increment from the last one
  const providedPoNumber = formData.get("po_number")?.toString().trim() || null;
  let poNumber = providedPoNumber;

  if (!poNumber) {
    const { data: latest } = await supabase
      .from("purchase_order")
      .select("po_number")
      .eq("tenant_id", tenantId)
      .not("po_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    poNumber = incrementPoNumber(latest?.po_number ?? null);
  }

  const { error } = await supabase.from("purchase_order").insert({
    tenant_id: tenantId,
    supplier_id: supplierId,
    status,
    po_number: poNumber,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity({ event: "purchase_order.created", metadata: { poNumber } });

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

  await logActivity({ event: "purchase_order.status_changed", metadata: { status } });

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

  await logActivity({ event: "purchase_order.line_added" });

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

  await logActivity({ event: "purchase_order.line_updated" });

  revalidatePath("/app/purchasing");
}
