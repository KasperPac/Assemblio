"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

// ─── Pure helpers (re-exported from helpers.ts for testing) ──────────────────

export type { ReceiptStatus } from "./helpers";
export { computeReceiptStatus, computeVariance } from "./helpers";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeliveryReceiptLineInput = {
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: number;
  quantity_expected: number | null;
  notes: string | null;
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createDeliveryReceipt(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/auth/login");

  const linesJson = formData.get("lines") as string;
  let lines: DeliveryReceiptLineInput[];
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Invalid line data" };
  }
  if (lines.length === 0) return { error: "At least one line is required" };

  const purchaseOrderId =
    (formData.get("purchase_order_id") as string) || null;
  const supplierId = (formData.get("supplier_id") as string) || null;
  const supplierNameOverride =
    (formData.get("supplier_name_override") as string) || null;

  if (!supplierId && !supplierNameOverride)
    return { error: "Supplier is required" };

  const supplierReference = (formData.get("supplier_reference") as string) ?? "";
  if (!supplierReference) return { error: "Supplier reference is required" };

  const stockInReason = purchaseOrderId
    ? "supplier_delivery"
    : ((formData.get("stock_in_reason") as string) || null);
  if (!purchaseOrderId && !stockInReason)
    return { error: "Reason is required for non-PO receipts" };

  const { data: receipt, error: receiptError } = await supabase
    .from("delivery_receipt")
    .insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      supplier_name_override: supplierNameOverride,
      supplier_reference: supplierReference,
      purchase_order_id: purchaseOrderId,
      location_id: formData.get("location_id") as string,
      received_at:
        (formData.get("received_at") as string) || new Date().toISOString(),
      notes: (formData.get("notes") as string) || null,
      stock_in_reason: stockInReason,
      status: "unmatched",
      created_by: authData.user.id,
    })
    .select("id")
    .single();

  if (receiptError || !receipt)
    return { error: receiptError?.message ?? "Failed to create receipt" };

  const { error: linesError } = await supabase
    .from("delivery_receipt_line")
    .insert(
      lines.map((l) => ({
        tenant_id: tenantId,
        delivery_receipt_id: receipt.id,
        component_id: l.component_id,
        purchase_order_line_id: l.purchase_order_line_id,
        quantity_delivered: l.quantity_delivered,
        quantity_expected: l.quantity_expected,
        notes: l.notes,
      }))
    );

  if (linesError) {
    await supabase.from("delivery_receipt").delete().eq("id", receipt.id);
    return { error: linesError.message };
  }

  const { error: rpcError } = await supabase.rpc("receive_delivery_receipt", {
    p_delivery_receipt_id: receipt.id,
  });

  if (rpcError) return { error: rpcError.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "delivery_receipt_created",
    metadata: {
      delivery_receipt_id: receipt.id,
      supplier_reference: supplierReference,
      lines_count: lines.length,
      purchase_order_id: purchaseOrderId,
    },
  });

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  redirect(`/app/goods-inwards/${receipt.id}`);
}

export async function linkReceiptToPo(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const receiptId = formData.get("receipt_id") as string;
  const purchaseOrderId = formData.get("purchase_order_id") as string;

  const { data: receipt } = await supabase
    .from("delivery_receipt")
    .select("*, delivery_receipt_line(*)")
    .eq("id", receiptId)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) return { error: "Receipt not found" };
  if (receipt.status !== "unmatched")
    return { error: "Receipt is already linked to a PO" };

  const { data: poLines } = await supabase
    .from("purchase_order_line")
    .select("id, component_id, quantity, quantity_received")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId);

  if (!poLines) return { error: "Purchase order not found" };

  const poLineByComponent = new Map(poLines.map((l) => [l.component_id, l]));
  const updatedLines: Array<{
    quantity_delivered: number;
    quantity_expected: number | null;
  }> = [];

  for (const line of receipt.delivery_receipt_line) {
    const poLine = poLineByComponent.get(line.component_id);
    const qtyExpected = poLine
      ? poLine.quantity - poLine.quantity_received
      : null;

    await supabase
      .from("delivery_receipt_line")
      .update({
        purchase_order_line_id: poLine?.id ?? null,
        quantity_expected: qtyExpected,
      })
      .eq("id", line.id)
      .eq("tenant_id", tenantId);

    if (poLine) {
      const applied = Math.min(
        line.quantity_delivered,
        Math.max(poLine.quantity - poLine.quantity_received, 0)
      );
      if (applied > 0) {
        await supabase
          .from("purchase_order_line")
          .update({ quantity_received: poLine.quantity_received + applied })
          .eq("id", poLine.id)
          .eq("tenant_id", tenantId);
      }
    }

    updatedLines.push({
      quantity_delivered: line.quantity_delivered,
      quantity_expected: qtyExpected,
    });
  }

  const newStatus = computeReceiptStatus(purchaseOrderId, updatedLines);

  await supabase
    .from("delivery_receipt")
    .update({ purchase_order_id: purchaseOrderId, status: newStatus })
    .eq("id", receiptId)
    .eq("tenant_id", tenantId);

  const { data: remaining } = await supabase
    .from("purchase_order_line")
    .select("quantity, quantity_received")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId);

  if (remaining?.every((l) => l.quantity_received >= l.quantity)) {
    await supabase
      .from("purchase_order")
      .update({ status: "received" })
      .eq("id", purchaseOrderId)
      .eq("tenant_id", tenantId);
  }

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "delivery_receipt_linked",
    metadata: {
      delivery_receipt_id: receiptId,
      purchase_order_id: purchaseOrderId,
    },
  });

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");

  redirect(`/app/goods-inwards/${receiptId}`);
}
