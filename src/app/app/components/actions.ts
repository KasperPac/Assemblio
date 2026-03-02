"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

type ComponentState = {
  error?: string;
  success?: string;
};

function parseNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createComponent(
  _prevState: ComponentState,
  formData: FormData
): Promise<ComponentState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const sku = formData.get("sku")?.toString().trim() ?? "";
  const unit = formData.get("unit")?.toString().trim() ?? "";
  const reorderPoint = parseNumber(formData.get("reorder_point")) ?? 0;
  const costPerUnit = parseNumber(formData.get("cost_per_unit")) ?? 0;

  if (!name) {
    return { error: "Component name is required." };
  }

  const context = await getServerTenantContext();
  if (!context) {
    return { error: "Missing tenant context." };
  }
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("component").insert({
    tenant_id: tenantId,
    name,
    sku: sku || null,
    unit: unit || null,
    reorder_point: reorderPoint,
    cost_per_unit: costPerUnit,
  });

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "component_created",
    metadata: { name, sku: sku || null },
  });

  revalidatePath("/app/components");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");
  return { success: "Component created." };
}
