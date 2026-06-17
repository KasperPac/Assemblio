"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { logActivity } from "@/lib/activity/log";

type SupplierState = {
  error?: string;
  success?: string;
};

export async function createSupplier(
  _prevState: SupplierState,
  formData: FormData
): Promise<SupplierState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  if (!name) {
    return { error: "Supplier name is required." };
  }

  const context = await getServerTenantContext();
  if (!context) {
    return { error: "Missing tenant context." };
  }
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("suppliers").insert({
    tenant_id: tenantId,
    name,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity({ event: "supplier.created", metadata: { name } });

  revalidatePath("/app/suppliers");
  revalidatePath("/app/purchasing");
  return { success: "Supplier created." };
}
