"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

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

  revalidatePath("/app/suppliers");
  revalidatePath("/app/purchasing");
  return { success: "Supplier created." };
}

export async function updateSupplierName(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  if (!supplierId || !name) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("suppliers")
    .update({ name })
    .eq("tenant_id", tenantId)
    .eq("id", supplierId);
  revalidatePath("/app/suppliers");
  revalidatePath("/app/purchasing");
}
