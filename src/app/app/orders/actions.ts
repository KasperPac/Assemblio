"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { reconcileOrderAllocations } from "@/lib/allocation/reconcile-order";

export async function allocateOrder(formData: FormData) {
  const orderId = formData.get("order_id")?.toString() ?? "";
  if (!orderId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const result = await reconcileOrderAllocations(
    supabase,
    tenantId,
    orderId
  );

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "order_allocation_run",
    metadata: {
      order_id: orderId,
      changes_applied: result.applied,
      missing_bom_lines: result.skippedMissingBom,
      cleared_only: result.clearedOnly,
    },
  });

  revalidatePath("/app/orders");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");
}
