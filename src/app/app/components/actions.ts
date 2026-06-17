"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { validateGroupName } from "./helpers";
import { searchComponentImage } from "@/lib/nexar/client";
import { logActivity } from "@/lib/activity/log";

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
  const description = formData.get("description")?.toString().trim() || null;
  const supplierPartNumber = formData.get("supplier_part_number")?.toString().trim() || null;

  if (!name) {
    return { error: "Component name is required." };
  }

  const context = await getServerTenantContext();
  if (!context) {
    return { error: "Missing tenant context." };
  }
  const { supabase, tenantId } = context;

  const { data: newComponent, error } = await supabase
    .from("component")
    .insert({
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
      description,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (supplierId && newComponent?.id) {
    const { error: scErr } = await supabase
      .from("supplier_components")
      .upsert(
        {
          tenant_id: tenantId,
          supplier_id: supplierId,
          component_id: newComponent.id,
          supplier_part_number: supplierPartNumber,
          is_preferred: true,
        },
        { onConflict: "tenant_id,supplier_id,component_id", ignoreDuplicates: false }
      );
    if (scErr) console.error("supplier_components upsert failed:", scErr.message);
  }

  await logActivity({ event: "component.created", entityId: newComponent?.id, metadata: { name, sku: sku || null } });

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
  const description = formData.get("description")?.toString().trim() || null;

  if (!name) return { error: "Component name is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can edit components." };
  }

  const { data: current } = await supabase
    .from("component")
    .select("name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_id, group_id, description")
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
      description,
    })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  await logActivity({ event: "component.updated", entityId: componentId, metadata: { name } });

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

  await logActivity({ event: "component.bin_location_updated", entityId: componentId, metadata: { name: current?.name } });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return {};
}

export async function updateComponentSupplier(
  _prevState: ComponentState,
  formData: FormData
): Promise<ComponentState> {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";

  if (!supplierComponentId || !componentId) return { error: "Missing required fields." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can edit supplier links." };
  }

  const unitCost = parseNumber(formData.get("unit_cost"));
  const leadTimeDays = parseNumber(formData.get("lead_time_days"));
  const moq = parseNumber(formData.get("moq"));
  const partNumber = formData.get("supplier_part_number")?.toString().trim() || null;

  const { error } = await supabase
    .from("supplier_components")
    .update({
      unit_cost: unitCost,
      lead_time_days: leadTimeDays,
      moq,
      supplier_part_number: partNumber,
    })
    .eq("id", supplierComponentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  await logActivity({ event: "component.supplier_updated", entityId: componentId });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return { success: "Supplier link updated." };
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
    bomComponentsResult,
    { data: stockRows },
    { data: openPoLines },
    { data: openAllocations },
  ] = await Promise.all([
    supabase
      .from("product_bom_component")
      .select("product_bom_id")
      .eq("component_id", componentId)
      .eq("tenant_id", tenantId),
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

  const bomComponentRows = bomComponentsResult?.data ?? [];
  let activeBomCount = 0;
  if (bomComponentRows.length > 0) {
    const bomIds = bomComponentRows.map((r: { product_bom_id: string }) => r.product_bom_id);
    const { data: activeBomsData } = await supabase
      .from("product_bom")
      .select("id")
      .in("id", bomIds)
      .eq("is_active", true)
      .eq("tenant_id", tenantId);
    activeBomCount = (activeBomsData ?? []).length;
  }

  const conflicts: string[] = [];

  if (activeBomCount > 0) {
    conflicts.push(`Used in ${activeBomCount} active BOM${activeBomCount !== 1 ? "s" : ""}`);
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

  await logActivity({ event: "component.archived", entityId: componentId });

  revalidatePath("/app/components");
  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return { success: true };
}

export async function createComponentGroup(
  name: string
): Promise<{ group: { id: string; name: string } } | { error: string }> {
  const validationError = validateGroupName(name);
  if (validationError) return { error: validationError };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId: _tenantId, role } = context;
  const tenantId = _tenantId!;

  // Group management is admin-only; component creation is open to all members
  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can create groups." };
  }

  const trimmedName = name.trim();

  const { data, error } = await supabase
    .from("component_group")
    .insert({ tenant_id: tenantId, name: trimmedName })
    .select("id, name")
    .single();

  if (error) return { error: error.message };

  await logActivity({ event: "component_group.created", entityId: data?.id, metadata: { name: trimmedName } });

  revalidatePath("/app/components");
  revalidatePath("/app/activity-log");
  return { group: { id: data.id, name: data.name } };
}

export async function uploadComponentImage(
  componentId: string,
  formData: FormData
): Promise<{ imageUrl?: string; error?: string }> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB" };

  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) return { error: "Use PNG, JPEG, or WebP" };

  // Confirm this component belongs to the caller's tenant
  const { data: comp, error: fetchErr } = await ctx.supabase
    .from("component")
    .select("id")
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId)
    .single();
  if (fetchErr || !comp) return { error: "Component not found" };

  // Fixed path without extension — re-uploads always overwrite cleanly
  const storagePath = `${ctx.tenantId}/${componentId}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await ctx.supabase.storage
    .from("component-images")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });
  if (uploadErr) return { error: uploadErr.message };

  const {
    data: { publicUrl },
  } = ctx.supabase.storage.from("component-images").getPublicUrl(storagePath);
  const versioned = `${publicUrl}?v=${Date.now()}`;

  const { error: dbErr } = await ctx.supabase
    .from("component")
    .update({ image_url: versioned })
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId);
  if (dbErr) return { error: dbErr.message };

  await logActivity({ event: "component.image_updated", entityId: componentId });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return { imageUrl: versioned };
}

export async function fetchComponentImageFromNexar(componentId: string): Promise<
  | { found: true; imageUrl: string }
  | { found: false; reason: "no_part_number" | "no_results" | "api_error" }
> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { found: false, reason: "api_error" };

  // Verify the component belongs to the caller's tenant
  const { data: comp, error: compErr } = await ctx.supabase
    .from("component")
    .select("id")
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId)
    .single();
  if (compErr || !comp) return { found: false, reason: "api_error" };

  // Look up preferred supplier part number (many-to-one join; suppliers is always an object)
  const { data: sc } = await ctx.supabase
    .from("supplier_components")
    .select("supplier_part_number, suppliers(name)")
    .eq("component_id", componentId)
    .eq("tenant_id", ctx.tenantId)
    .eq("is_preferred", true)
    .maybeSingle();

  if (!sc) return { found: false, reason: "no_part_number" };

  const partNumber = sc.supplier_part_number?.trim();
  if (!partNumber) return { found: false, reason: "no_part_number" };

  // Supabase may return the FK join as object or array depending on codegen; handle both.
  const suppliersData = sc.suppliers as unknown as
    | { name: string }
    | { name: string }[]
    | null;
  const supplierName = Array.isArray(suppliersData)
    ? suppliersData[0]?.name ?? ""
    : suppliersData?.name ?? "";

  const nexarResult = await searchComponentImage(
    `${partNumber} ${supplierName}`.trim()
  );

  if (!nexarResult.found) {
    await logActivity({ event: "component.image_fetch_failed", entityId: componentId, metadata: { reason: nexarResult.reason } });
    return { found: false, reason: nexarResult.reason };
  }

  // Download from Nexar CDN and store in our bucket
  let imageBytes: ArrayBuffer;
  let contentType = "image/jpeg";
  try {
    const imgResp = await fetch(nexarResult.imageUrl);
    if (!imgResp.ok) throw new Error(`Download failed: ${imgResp.status}`);
    contentType = imgResp.headers.get("content-type") ?? "image/jpeg";
    imageBytes = await imgResp.arrayBuffer();
  } catch {
    return { found: false, reason: "api_error" };
  }

  const storagePath = `${ctx.tenantId}/${componentId}`;
  const { error: uploadErr } = await ctx.supabase.storage
    .from("component-images")
    .upload(storagePath, imageBytes, { contentType, upsert: true });
  if (uploadErr) {
    console.error("component-images upload failed:", uploadErr.message);
    return { found: false, reason: "api_error" };
  }

  const {
    data: { publicUrl },
  } = ctx.supabase.storage.from("component-images").getPublicUrl(storagePath);
  const versioned = `${publicUrl}?v=${Date.now()}`;

  const { error: dbErr } = await ctx.supabase
    .from("component")
    .update({ image_url: versioned })
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId);
  if (dbErr) {
    console.error("component image_url update failed:", dbErr.message);
    return { found: false, reason: "api_error" };
  }

  await logActivity({ event: "component.image_updated", entityId: componentId });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return { found: true, imageUrl: versioned };
}

export async function removeComponentImage(
  componentId: string
): Promise<{ error?: string }> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const storagePath = `${ctx.tenantId}/${componentId}`;
  // Ignore storage delete errors — file may not exist
  await ctx.supabase.storage.from("component-images").remove([storagePath]);

  const { error: dbErr } = await ctx.supabase
    .from("component")
    .update({ image_url: null })
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId);
  if (dbErr) return { error: dbErr.message };

  await logActivity({ event: "component.image_removed", entityId: componentId });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return {};
}
