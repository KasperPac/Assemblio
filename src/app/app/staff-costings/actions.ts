"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

type ActionState = {
  error?: string;
  success?: string;
};

const LABOUR_GROUP_NAME = "Labour";

async function ensureLabourGroup(supabase: { from: (table: string) => any }, tenantId: string) {
  const { data: existing } = await supabase
    .from("component_group")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", LABOUR_GROUP_NAME)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("component_group")
    .insert({ tenant_id: tenantId, name: LABOUR_GROUP_NAME })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return created.id;
}

export async function addDepartment(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const rate = Number(formData.get("rate") ?? 0);

  if (!name) return { error: "Department name is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;
  if (!tenantId) return { error: "Missing tenant context." }; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  const groupId = await ensureLabourGroup(supabase, tenantId);

  const sku = `LBR-${name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`;

  const { error } = await supabase.from("component").insert({
    tenant_id: tenantId,
    group_id: groupId,
    name,
    sku,
    unit: "hrs",
    cost_per_unit: rate,
    reorder_point: 0,
    low_stock_level: 0,
  });

  if (error) return { error: error.message };

  revalidatePath("/app/staff-costings");
  revalidatePath("/app/components");
  return { success: `"${name}" added at $${rate}/hr.` };
}

export async function updateRate(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const componentId = formData.get("component_id")?.toString() ?? "";
  const rate = Number(formData.get("rate") ?? 0);

  if (!componentId) return { error: "Component ID required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update({ cost_per_unit: rate })
    .eq("tenant_id", tenantId)
    .eq("id", componentId);

  if (error) return { error: error.message };

  revalidatePath("/app/staff-costings");
  revalidatePath("/app/components");
  return { success: "Rate updated." };
}

export async function removeDepartment(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const componentId = formData.get("component_id")?.toString() ?? "";

  if (!componentId) return { error: "Component ID required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", componentId);

  if (error) {
    if (error.message.includes("foreign key")) {
      return { error: "Cannot delete — this department is used in one or more BOMs." };
    }
    return { error: error.message };
  }

  revalidatePath("/app/staff-costings");
  revalidatePath("/app/components");
  return { success: "Department removed." };
}
