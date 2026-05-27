"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function updateOrderSourceSla(formData: FormData) {
  const shopify = Number(formData.get("shopify_days") ?? 7);
  const manual = Number(formData.get("manual_days") ?? 10);
  if (!Number.isFinite(shopify) || shopify < 0) return;
  if (!Number.isFinite(manual) || manual < 0) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("order_source_sla")
    .upsert(
      [
        { tenant_id: tenantId, source: "shopify", lead_time_days: shopify },
        { tenant_id: tenantId, source: "manual", lead_time_days: manual },
      ],
      { onConflict: "tenant_id,source" }
    );

  revalidatePath("/app/settings/orders");
}
