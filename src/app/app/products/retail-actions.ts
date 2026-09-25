"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import { parseRetailItemForm } from "@/lib/products/retail-item";

export type RetailItemState = { error?: string; variantId?: string };

export async function createRetailItem(
  _prev: RetailItemState,
  form: FormData
): Promise<RetailItemState> {
  const context = await getServerTenantContext();
  if (!context?.tenantId) return { error: "Missing tenant context." };
  if (context.role !== "admin" && context.role !== "super_admin") {
    return { error: "Only admins can create retail items." };
  }

  const parsed = parseRetailItemForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.value;

  // Super-admins viewing as a tenant use the admin client (same rule as
  // requireBomEditor in ./actions.ts); the RPC re-checks tenant access.
  const db = context.role === "super_admin" ? createSupabaseAdminClient() : context.supabase;
  const { data, error } = await db.rpc("create_retail_item", {
    p_tenant_id: context.tenantId,
    p_variant_id: input.variantId,
    p_name: input.name,
    p_sku: input.sku,
    p_barcode: input.barcode,
    p_cost_per_unit: input.costPerUnit,
    p_supplier_id: input.supplierId,
    p_location_id: input.locationId,
    p_reorder_point: input.reorderPoint,
  });
  if (error) return { error: error.message || "Could not create the retail item." };

  const variantId = data as string;
  await logActivity({
    event: input.variantId ? "product.retail_attached" : "product.retail_created",
    metadata: { variant_id: variantId, name: input.name, sku: input.sku },
  });
  revalidatePath("/app/products");
  redirect(`/app/products/variants/${variantId}`);
}
