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

function parseUuid(value: FormDataEntryValue | null) {
  const str = value?.toString().trim() ?? "";
  return str.length > 0 ? str : null;
}

export async function createComponent(
  _prevState: ComponentState,
  formData: FormData
): Promise<ComponentState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const sku = formData.get("sku")?.toString().trim() ?? "";
  const unit = formData.get("unit")?.toString().trim() ?? "";
  const reorderPoint = parseNumber(formData.get("reorder_point")) ?? 0;
  const lowStockLevel = parseNumber(formData.get("low_stock_level")) ?? 0;
  const costPerUnit = parseNumber(formData.get("cost_per_unit")) ?? 0;
  const supplierId = parseUuid(formData.get("supplier_id"));
  const locationId = parseUuid(formData.get("location_id"));
  const groupId = parseUuid(formData.get("group_id"));

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
    low_stock_level: lowStockLevel,
    cost_per_unit: costPerUnit,
    supplier_id: supplierId,
    location_id: locationId,
    group_id: groupId,
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

export async function updateBinLocation(_prevState: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const componentId = formData.get("component_id")?.toString().trim() ?? "";
  const binSubLocationId = formData.get("bin_sub_location_id")?.toString().trim() || null;
  const binAisleId = formData.get("bin_aisle_id")?.toString().trim() || null;
  const binBayId = formData.get("bin_bay_id")?.toString().trim() || null;

  if (!componentId) return {};

  const context = await getServerTenantContext();
  if (!context) return {};
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update({
      bin_sub_location_id: binSubLocationId,
      bin_aisle_id: binAisleId,
      bin_bay_id: binBayId,
    })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath(`/app/components/${componentId}`);
  return {};
}
