"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function markLineShipped(formData: FormData) {
  const orderLineId = formData.get("order_line_id")?.toString();
  const orderId = formData.get("order_id")?.toString();
  if (!orderLineId || !orderId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("order_line")
    .update({ shipped_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", orderLineId)
    .is("shipped_at", null);

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "order_line_marked_shipped",
    metadata: { order_id: orderId, order_line_id: orderLineId },
  });

  revalidatePath(`/app/orders/${orderId}`);
  revalidatePath("/app/orders");
}
