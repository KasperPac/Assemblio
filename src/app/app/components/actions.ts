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

export async function updateComponent(
  componentId: string,
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
  const groupId = parseUuid(formData.get("group_id"));

  if (!name) return { error: "Component name is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can edit components." };
  }

  const { data: current } = await supabase
    .from("component")
    .select("name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_id, group_id")
    .eq("id", componentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!current) return { error: "Component not found." };

  const { error } = await supabase
    .from("component")
    .update({
      name,
      sku: sku || null,
      unit: unit || null,
      cost_per_unit: costPerUnit,
      reorder_point: reorderPoint,
      low_stock_level: lowStockLevel,
      supplier_id: supplierId,
      group_id: groupId,
    })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "component_updated",
    metadata: {
      component_id: componentId,
      before: {
        name: current.name,
        sku: current.sku,
        unit: current.unit,
        cost_per_unit: current.cost_per_unit,
        reorder_point: current.reorder_point,
        low_stock_level: current.low_stock_level,
        supplier_id: current.supplier_id,
        group_id: current.group_id,
      },
      after: {
        name,
        sku: sku || null,
        unit: unit || null,
        cost_per_unit: costPerUnit,
        reorder_point: reorderPoint,
        low_stock_level: lowStockLevel,
        supplier_id: supplierId,
        group_id: groupId,
      },
    },
  });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/components");
  revalidatePath("/app/activity-log");
  return { success: "Component updated." };
}

export async function updateBinLocation(_prevState: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const componentId = formData.get("component_id")?.toString().trim() ?? "";
  const binSubLocationId = formData.get("bin_sub_location_id")?.toString().trim() || null;
  const binAisleId = formData.get("bin_aisle_id")?.toString().trim() || null;
  const binBayId = formData.get("bin_bay_id")?.toString().trim() || null;

  if (!componentId) return {};

  const context = await getServerTenantContext();
  if (!context) return { error: "Unauthorized" };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can change bin locations." };
  }

  const { data: current } = await supabase
    .from("component")
    .select("name, bin_sub_location_id, bin_aisle_id, bin_bay_id")
    .eq("id", componentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!current) return { error: "Component not found." };

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

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "bin_location_updated",
    metadata: {
      component_id: componentId,
      component_name: current.name,
      old: {
        bin_sub_location_id: current.bin_sub_location_id,
        bin_aisle_id: current.bin_aisle_id,
        bin_bay_id: current.bin_bay_id,
      },
      new: {
        bin_sub_location_id: binSubLocationId,
        bin_aisle_id: binAisleId,
        bin_bay_id: binBayId,
      },
    },
  });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return {};
}

type ArchiveResult =
  | { success: true }
  | { error: string; conflicts: string[] };

export async function archiveComponent(componentId: string): Promise<ArchiveResult> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Unauthorized", conflicts: [] };
  const { supabase, tenantId: _tenantId, role } = context;
  const tenantId = _tenantId!;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can archive components.", conflicts: [] };
  }

  // Run conflict checks in parallel
  const [
    { data: activeBoms },
    { data: stockRows },
    { data: openPoLines },
    { data: openAllocations },
  ] = await Promise.all([
    supabase
      .from("product_bom_component")
      .select("product_bom_id, product_bom:product_bom_id!inner(is_active, variant:variant_id(product:product_id(title)))")
      .eq("component_id", componentId)
      .eq("product_bom.is_active", true),
    supabase
      .from("inventory_balance")
      .select("on_hand")
      .eq("component_id", componentId)
      .eq("tenant_id", tenantId)
      .gt("on_hand", 0),
    supabase
      .from("purchase_order_line")
      .select("id, purchase_order:purchase_order_id!inner(status)")
      .eq("component_id", componentId)
      .eq("tenant_id", tenantId)
      .not("purchase_order.status", "in", '("received","cancelled")'),
    supabase
      .from("order_component_allocation")
      .select("id, order_line:order_line_id!inner(order:order_id!inner(status))")
      .eq("component_id", componentId)
      .eq("tenant_id", tenantId)
      .not("order_line.order.status", "in", '("complete","cancelled")'),
  ]);

  const conflicts: string[] = [];

  if ((activeBoms ?? []).length > 0) {
    const bomCount = (activeBoms ?? []).length;
    conflicts.push(`Used in ${bomCount} active BOM${bomCount !== 1 ? "s" : ""}`);
  }
  if ((stockRows ?? []).length > 0) {
    const totalOnHand = (stockRows ?? []).reduce((s, r) => s + (r.on_hand ?? 0), 0);
    conflicts.push(`Has ${totalOnHand} unit${totalOnHand !== 1 ? "s" : ""} on hand`);
  }
  if ((openPoLines ?? []).length > 0) {
    conflicts.push(`Has ${openPoLines!.length} open purchase order line${openPoLines!.length !== 1 ? "s" : ""}`);
  }
  if ((openAllocations ?? []).length > 0) {
    conflicts.push(`Allocated to ${openAllocations!.length} open order${openAllocations!.length !== 1 ? "s" : ""}`);
  }

  if (conflicts.length > 0) {
    return { error: "Cannot archive: resolve the following first.", conflicts };
  }

  const { error } = await supabase
    .from("component")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message, conflicts: [] };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "component_archived",
    metadata: { component_id: componentId },
  });

  revalidatePath("/app/components");
  revalidatePath("/app/activity-log");
  return { success: true };
}
