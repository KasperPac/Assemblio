"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type BomActionState = {
  error?: string;
  success?: string;
};

function parseNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function encodeMessage(message: string) {
  return encodeURIComponent(message);
}

function redirectVariantResult(variantId: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/app/products/variants/${variantId}?${query.toString()}`);
}

const BOM_EDITOR_ROLES = new Set(["admin", "super_admin"]);

async function requireBomEditor() {
  const context = await getServerTenantContext();
  if (!context || !context.tenantId) {
    return { error: "Missing tenant context." };
  }

  const { supabase, tenantId: _tenantId, role } = context;
  if (!_tenantId) {
    return { error: "Missing tenant context." };
  }
  const tenantId: string = _tenantId;

  if (!BOM_EDITOR_ROLES.has(role)) {
    return {
      error: "Only admin and super_admin can create or copy BOMs.",
    };
  }

  // Super-admins viewing as a tenant use the admin client to bypass RLS,
  // since their JWT may not carry the viewed tenant's membership claims.
  const db = role === "super_admin" ? createSupabaseAdminClient() : supabase;

  return {
    supabase: db,
    tenantId,
  };
}

async function getNextBomVersion(
  tenantId: string,
  variantId: string,
  supabase: SupabaseClient
) {
  const { data: latestBom } = await supabase
    .from("product_bom")
    .select("version")
    .eq("tenant_id", tenantId)
    .eq("variant_id", variantId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(latestBom?.version ?? 0) + 1;
}

export async function fetchBomLines(
  bomId: string
): Promise<{ component_id: string; quantity: number }[]> {
  const context = await getServerTenantContext();
  if (!context || !context.tenantId) return [];
  const { supabase, tenantId, role } = context;

  const db = role === "super_admin" ? createSupabaseAdminClient() : supabase;

  const { data } = await db
    .from("product_bom_component")
    .select("component_id,quantity")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", bomId);

  return (data ?? []).map((row) => ({
    component_id: row.component_id as string,
    quantity: Number(row.quantity),
  }));
}

export async function createBomWithComponents(
  _prevState: BomActionState,
  formData: FormData
): Promise<BomActionState> {
  const variantId = formData.get("target_variant_id")?.toString() ?? "";
  const linesJson = formData.get("lines")?.toString() ?? "[]";
  const notes = formData.get("notes")?.toString().trim() ?? "";

  if (!variantId) return { error: "Variant is required." };

  let lines: Array<{ component_id: string; quantity: number; yield_pct?: number }>;
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Invalid component data." };
  }

  if (lines.length === 0) return { error: "Select at least one component." };

  const context = await requireBomEditor();
  if ("error" in context) return { error: context.error };
  const { supabase, tenantId } = context;

  const { data: variant } = await supabase
    .from("product_variant")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", variantId)
    .maybeSingle();

  if (!variant?.id) return { error: "Variant not found." };

  const version = await getNextBomVersion(tenantId, variantId, supabase);

  const { data: insertedBom, error: bomError } = await supabase
    .from("product_bom")
    .insert({
      tenant_id: tenantId,
      variant_id: variantId,
      version,
      status: "draft",
      is_active: false,
    })
    .select("id")
    .single();

  if (bomError || !insertedBom?.id) {
    return { error: bomError?.message ?? "Failed to create BOM." };
  }

  const rows = lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      tenant_id: tenantId,
      product_bom_id: insertedBom.id,
      component_id: l.component_id,
      quantity: l.quantity,
      yield_pct: l.yield_pct ?? 1.0,
    }));

  if (rows.length > 0) {
    const { error: lineError } = await supabase
      .from("product_bom_component")
      .insert(rows);

    if (lineError) {
      await supabase.from("product_bom").delete().eq("id", insertedBom.id);
      return { error: lineError.message };
    }
  }

  if (notes) {
    await supabase.from("activity_log").insert({
      tenant_id: tenantId,
      event: "bom_created",
      metadata: {
        variant_id: variantId,
        version,
        components: rows.length,
        notes,
      },
    });
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath(`/app/products`);
  revalidatePath("/app/templates");
  return { success: `Draft BOM v${version} created with ${rows.length} components.` };
}

export async function createDraftBomFromScratch(
  _prevState: BomActionState,
  formData: FormData
): Promise<BomActionState> {
  const variantId = formData.get("target_variant_id")?.toString() ?? "";
  if (!variantId) {
    return { error: "Variant is required." };
  }

  const context = await requireBomEditor();
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, tenantId } = context;

  const { data: variant } = await supabase
    .from("product_variant")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", variantId)
    .maybeSingle();

  if (!variant?.id) {
    return { error: "Variant not found." };
  }

  const version = await getNextBomVersion(tenantId, variantId, supabase);

  const { error } = await supabase.from("product_bom").insert({
    tenant_id: tenantId,
    variant_id: variantId,
    version,
    status: "draft",
    is_active: false,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/products");
  revalidatePath("/app/templates");
  return { success: `Draft BOM v${version} created.` };
}

export async function copyBomToDraft(
  _prevState: BomActionState,
  formData: FormData
): Promise<BomActionState> {
  const targetVariantId = formData.get("target_variant_id")?.toString() ?? "";
  const sourceBomId = formData.get("source_bom_id")?.toString() ?? "";

  if (!targetVariantId || !sourceBomId) {
    return { error: "Target variant and source BOM are required." };
  }

  const context = await requireBomEditor();
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, tenantId } = context;

  const [{ data: targetVariant }, { data: sourceBom }] = await Promise.all([
    supabase
      .from("product_variant")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", targetVariantId)
      .maybeSingle(),
    supabase
      .from("product_bom")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", sourceBomId)
      .maybeSingle(),
  ]);

  if (!targetVariant?.id) {
    return { error: "Target variant not found." };
  }

  if (!sourceBom?.id) {
    return { error: "Source BOM not found." };
  }

  const version = await getNextBomVersion(tenantId, targetVariantId, supabase);

  const { data: insertedBom, error: bomInsertError } = await supabase
    .from("product_bom")
    .insert({
      tenant_id: tenantId,
      variant_id: targetVariantId,
      version,
      status: "draft",
      is_active: false,
    })
    .select("id")
    .single();

  if (bomInsertError || !insertedBom?.id) {
    return { error: bomInsertError?.message ?? "Failed to create target BOM." };
  }

  const { data: sourceLines, error: sourceLinesError } = await supabase
    .from("product_bom_component")
    .select("component_id,quantity,yield_pct,position")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", sourceBomId)
    .order("position", { ascending: true });

  if (sourceLinesError) {
    return { error: sourceLinesError.message };
  }

  const rowsToInsert = (sourceLines ?? []).map((line, i) => ({
    tenant_id: tenantId,
    product_bom_id: insertedBom.id,
    component_id: line.component_id,
    quantity: line.quantity,
    yield_pct: line.yield_pct ?? 1.0,
    position: line.position ?? i + 1,
  }));

  if (rowsToInsert.length > 0) {
    const { error: lineInsertError } = await supabase
      .from("product_bom_component")
      .insert(rowsToInsert);

    if (lineInsertError) {
      await supabase
        .from("product_bom")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", insertedBom.id);
      return { error: lineInsertError.message };
    }
  }

  revalidatePath(`/app/products/variants/${targetVariantId}`);
  revalidatePath("/app/products");
  revalidatePath("/app/templates");

  return {
    success: `Created draft BOM v${version} from source (${rowsToInsert.length} lines).`,
  };
}

export async function createBomFromTemplate(
  _prevState: BomActionState,
  formData: FormData
): Promise<BomActionState> {
  const targetVariantId = formData.get("target_variant_id")?.toString() ?? "";
  const templateId = formData.get("template_id")?.toString() ?? "";

  if (!targetVariantId || !templateId) {
    return { error: "Variant and template are required." };
  }

  const context = await requireBomEditor();
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, tenantId } = context;

  const [{ data: targetVariant }, { data: template }] = await Promise.all([
    supabase
      .from("product_variant")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", targetVariantId)
      .maybeSingle(),
    supabase
      .from("bom_template")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .eq("id", templateId)
      .maybeSingle(),
  ]);

  if (!targetVariant?.id) return { error: "Variant not found." };
  if (!template?.id) return { error: "Template not found." };

  const version = await getNextBomVersion(tenantId, targetVariantId, supabase);

  const { data: insertedBom, error: bomError } = await supabase
    .from("product_bom")
    .insert({
      tenant_id: tenantId,
      variant_id: targetVariantId,
      version,
      status: "draft",
      is_active: false,
      component_template_id: templateId,
    })
    .select("id")
    .single();

  if (bomError || !insertedBom?.id) {
    return { error: bomError?.message ?? "Failed to create BOM." };
  }

  const { data: templateLines, error: linesError } = await supabase
    .from("bom_template_line")
    .select("id,component_id,quantity")
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId);

  if (linesError) return { error: linesError.message };

  const rows = (templateLines ?? []).map((line) => ({
    tenant_id: tenantId,
    product_bom_id: insertedBom.id,
    component_id: line.component_id,
    quantity: line.quantity,
    source_template_line_id: line.id,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("product_bom_component")
      .insert(rows);

    if (insertError) {
      await supabase.from("product_bom").delete().eq("id", insertedBom.id);
      return { error: insertError.message };
    }
  }

  revalidatePath(`/app/products/variants/${targetVariantId}`);
  revalidatePath("/app/products");
  revalidatePath("/app/templates");

  return {
    success: `Created draft BOM v${version} from template "${template.name}" (${rows.length} lines).`,
  };
}

export async function createBomLaborLine(formData: FormData) {
  const productBomId = formData.get("product_bom_id")?.toString() ?? "";
  const departmentId = formData.get("department_id")?.toString() ?? "";
  const operationName = formData.get("operation_name")?.toString().trim() ?? "";
  const sequence = parseNumber(formData.get("sequence")) ?? 1;
  const setupHours = parseNumber(formData.get("setup_hours")) ?? 0;
  const runHoursPerUnit = parseNumber(formData.get("run_hours_per_unit")) ?? 0;
  const adminHoursPerUnit = parseNumber(formData.get("admin_hours_per_unit")) ?? 0;
  const electricityKwhPerUnit = parseNumber(formData.get("electricity_kwh_per_unit")) ?? 0;
  const gasUnitsPerUnit = parseNumber(formData.get("gas_units_per_unit")) ?? 0;
  const notes = formData.get("notes")?.toString().trim() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";

  if (!productBomId || !departmentId || !operationName || !variantId) {
    redirectVariantResult(variantId || "", {
      laborError: encodeMessage("BOM, department, and operation are required."),
    });
  }

  if (
    sequence < 1 ||
    setupHours < 0 ||
    runHoursPerUnit < 0 ||
    adminHoursPerUnit < 0 ||
    electricityKwhPerUnit < 0 ||
    gasUnitsPerUnit < 0
  ) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage("Labor routing values cannot be negative, and sequence must be at least 1."),
    });
  }

  const context = await requireBomEditor();
  if ("error" in context) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage(context.error ?? "Authorization failed."),
    });
  }

  const { supabase, tenantId } = context as {
    supabase: SupabaseClient;
    tenantId: string;
  };

  const { error } = await supabase.from("product_bom_labor").insert({
    tenant_id: tenantId,
    product_bom_id: productBomId,
    department_id: departmentId,
    operation_name: operationName,
    sequence,
    setup_hours: setupHours,
    run_hours_per_unit: runHoursPerUnit,
    admin_hours_per_unit: adminHoursPerUnit,
    electricity_kwh_per_unit: electricityKwhPerUnit,
    gas_units_per_unit: gasUnitsPerUnit,
    notes: notes || null,
  });

  if (error) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage(error.message),
    });
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
}

export async function updateBomLaborLine(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const departmentId = formData.get("department_id")?.toString() ?? "";
  const operationName = formData.get("operation_name")?.toString().trim() ?? "";
  const sequence = parseNumber(formData.get("sequence")) ?? 1;
  const setupHours = parseNumber(formData.get("setup_hours")) ?? 0;
  const runHoursPerUnit = parseNumber(formData.get("run_hours_per_unit")) ?? 0;
  const adminHoursPerUnit = parseNumber(formData.get("admin_hours_per_unit")) ?? 0;
  const electricityKwhPerUnit = parseNumber(formData.get("electricity_kwh_per_unit")) ?? 0;
  const gasUnitsPerUnit = parseNumber(formData.get("gas_units_per_unit")) ?? 0;
  const notes = formData.get("notes")?.toString().trim() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const blockedByRaw = formData.getAll("blocked_by");
  const blockedBy = blockedByRaw
    .map((v) => parseInt(v.toString(), 10))
    .filter((n) => Number.isFinite(n));

  if (!lineId || !departmentId || !operationName || !variantId) {
    redirectVariantResult(variantId || "", {
      laborError: encodeMessage("Labor routing update is missing required values."),
    });
  }

  if (
    sequence < 1 ||
    setupHours < 0 ||
    runHoursPerUnit < 0 ||
    adminHoursPerUnit < 0 ||
    electricityKwhPerUnit < 0 ||
    gasUnitsPerUnit < 0
  ) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage("Labor routing values cannot be negative, and sequence must be at least 1."),
    });
  }

  const context = await requireBomEditor();
  if ("error" in context) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage(context.error ?? "Authorization failed."),
    });
  }

  const { supabase, tenantId } = context as {
    supabase: SupabaseClient;
    tenantId: string;
  };

  // Check sequence uniqueness within BOM
  const { data: existingLine } = await supabase
    .from("product_bom_labor")
    .select("product_bom_id")
    .eq("id", lineId)
    .single();

  if (existingLine) {
    const { count } = await supabase
      .from("product_bom_labor")
      .select("id", { count: "exact", head: true })
      .eq("product_bom_id", existingLine.product_bom_id)
      .eq("sequence", sequence)
      .neq("id", lineId);

    if ((count ?? 0) > 0) {
      redirectVariantResult(variantId, {
        tab: "routing",
        laborError: encodeMessage(`Sequence ${sequence} is already used by another operation in this BOM.`),
      });
      return;
    }
  }

  const { error } = await supabase
    .from("product_bom_labor")
    .update({
      department_id: departmentId,
      operation_name: operationName,
      sequence,
      blocked_by: blockedBy,
      setup_hours: setupHours,
      run_hours_per_unit: runHoursPerUnit,
      admin_hours_per_unit: adminHoursPerUnit,
      electricity_kwh_per_unit: electricityKwhPerUnit,
      gas_units_per_unit: gasUnitsPerUnit,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  if (error) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage(error.message),
    });
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
}

export async function deleteBomLaborLine(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  if (!lineId || !variantId) {
    redirectVariantResult(variantId || "", {
      laborError: encodeMessage("Labor routing delete is missing required values."),
    });
  }

  const context = await requireBomEditor();
  if ("error" in context) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage(context.error ?? "Authorization failed."),
    });
  }

  const { supabase, tenantId } = context as {
    supabase: SupabaseClient;
    tenantId: string;
  };
  const { error } = await supabase
    .from("product_bom_labor")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  if (error) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage(error.message),
    });
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
}

export async function duplicateBomAsDraft(
  _prevState: BomActionState,
  formData: FormData
): Promise<BomActionState> {
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const sourceBomId = formData.get("source_bom_id")?.toString() ?? "";

  if (!variantId || !sourceBomId) {
    return { error: "Variant and source BOM are required." };
  }

  const context = await requireBomEditor();
  if ("error" in context) return { error: context.error };
  const { supabase, tenantId } = context;

  const { data: sourceLines, error: linesError } = await supabase
    .from("product_bom_component")
    .select("component_id,quantity,yield_pct,position")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", sourceBomId)
    .order("position", { ascending: true });

  if (linesError) return { error: linesError.message };

  const version = await getNextBomVersion(tenantId, variantId, supabase);

  const { data: newBom, error: bomError } = await supabase
    .from("product_bom")
    .insert({
      tenant_id: tenantId,
      variant_id: variantId,
      version,
      status: "draft",
      is_active: false,
    })
    .select("id")
    .single();

  if (bomError || !newBom?.id) {
    return { error: bomError?.message ?? "Failed to create draft BOM." };
  }

  const rows = (sourceLines ?? []).map((l, i) => ({
    tenant_id: tenantId,
    product_bom_id: newBom.id,
    component_id: l.component_id,
    quantity: l.quantity,
    yield_pct: l.yield_pct ?? 1.0,
    position: l.position ?? i + 1,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("product_bom_component")
      .insert(rows);
    if (insertError) {
      await supabase.from("product_bom").delete().eq("tenant_id", tenantId).eq("id", newBom.id);
      return { error: insertError.message };
    }
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/templates");
  return { success: `Draft BOM v${version} created (${rows.length} lines).` };
}

export async function saveBomAsTemplate(
  _prevState: BomActionState,
  formData: FormData
): Promise<BomActionState> {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  const templateName = formData.get("template_name")?.toString().trim() ?? "";

  if (!bomId || !templateName) {
    return { error: "BOM ID and template name are required." };
  }

  const context = await requireBomEditor();
  if ("error" in context) return { error: context.error };
  const { supabase, tenantId } = context;

  // Create template
  const { data: template, error: tplError } = await supabase
    .from("bom_template")
    .insert({ tenant_id: tenantId, name: templateName })
    .select("id")
    .single();

  if (tplError || !template?.id) {
    return { error: tplError?.message ?? "Failed to create template." };
  }

  // Copy BOM lines to template lines
  const { data: bomLines } = await supabase
    .from("product_bom_component")
    .select("component_id,quantity")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", bomId);

  if ((bomLines ?? []).length > 0) {
    const rows = (bomLines ?? []).map((line) => ({
      tenant_id: tenantId,
      template_id: template.id,
      component_id: line.component_id,
      quantity: line.quantity,
    }));

    const { error: lineError } = await supabase
      .from("bom_template_line")
      .insert(rows);

    if (lineError) {
      return { error: lineError.message };
    }
  }

  revalidatePath("/app/templates");
  return { success: `Template "${templateName}" created with ${(bomLines ?? []).length} lines.` };
}

export async function upsertNotificationTrigger(formData: FormData) {
  const auth = await requireBomEditor();
  if ("error" in auth) return;
  const { supabase, tenantId } = auth;

  const productBomId = formData.get("product_bom_id")?.toString() ?? "";
  const routingSequenceRaw = formData.get("routing_sequence")?.toString() ?? "";
  const messageTemplate = formData.get("message_template")?.toString()?.trim() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";

  if (!productBomId || !routingSequenceRaw || !messageTemplate || !variantId) {
    redirectVariantResult(variantId, { tab: "notifications", notifError: encodeMessage("Missing required fields.") });
    return;
  }

  const routingSequence = parseInt(routingSequenceRaw, 10);
  if (!Number.isFinite(routingSequence)) {
    redirectVariantResult(variantId, { tab: "notifications", notifError: encodeMessage("Invalid sequence.") });
    return;
  }

  const { error } = await supabase
    .from("product_notification_trigger")
    .upsert(
      { tenant_id: tenantId, product_bom_id: productBomId, routing_sequence: routingSequence, message_template: messageTemplate, channel: "email" },
      { onConflict: "tenant_id,product_bom_id,routing_sequence" }
    );

  if (error) {
    redirectVariantResult(variantId, { tab: "notifications", notifError: encodeMessage(error.message) });
    return;
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/products");
  redirectVariantResult(variantId, { tab: "notifications", notifSuccess: encodeMessage("Notification saved.") });
}

export async function removeNotificationTrigger(formData: FormData) {
  const auth = await requireBomEditor();
  if ("error" in auth) return;
  const { supabase, tenantId } = auth;

  const productBomId = formData.get("product_bom_id")?.toString() ?? "";
  const routingSequenceRaw = formData.get("routing_sequence")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";

  if (!productBomId || !routingSequenceRaw || !variantId) {
    redirectVariantResult(variantId, { tab: "notifications", notifError: encodeMessage("Missing required fields.") });
    return;
  }

  const routingSequence = parseInt(routingSequenceRaw, 10);
  if (!Number.isFinite(routingSequence)) {
    redirectVariantResult(variantId, { tab: "notifications", notifError: encodeMessage("Invalid sequence.") });
    return;
  }

  const { error } = await supabase
    .from("product_notification_trigger")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", productBomId)
    .eq("routing_sequence", routingSequence);

  if (error) {
    redirectVariantResult(variantId, { tab: "notifications", notifError: encodeMessage(error.message) });
    return;
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/products");
  redirectVariantResult(variantId, { tab: "notifications", notifSuccess: encodeMessage("Notification removed.") });
}

export async function applyLaborTemplate(formData: FormData) {
  const productBomId = formData.get("product_bom_id")?.toString() ?? "";
  const templateId = formData.get("template_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";

  if (!productBomId || !templateId || !variantId) {
    redirectVariantResult(variantId || "", {
      laborError: encodeMessage("BOM and template are required."),
    });
  }

  const context = await requireBomEditor();
  if ("error" in context) {
    redirectVariantResult(variantId, {
      laborError: encodeMessage(context.error ?? "Authorization failed."),
    });
  }

  const { supabase, tenantId } = context as {
    supabase: SupabaseClient;
    tenantId: string;
  };

  const [{ data: bom }, { data: template }] = await Promise.all([
    supabase
      .from("product_bom")
      .select("id,labor_template_id")
      .eq("tenant_id", tenantId)
      .eq("id", productBomId)
      .maybeSingle(),
    supabase
      .from("labor_template")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .eq("id", templateId)
      .maybeSingle(),
  ]);

  if (!bom?.id) {
    redirectVariantResult(variantId, { laborError: encodeMessage("BOM not found.") });
  }
  if (!template?.id) {
    redirectVariantResult(variantId, { laborError: encodeMessage("Labor template not found.") });
  }

  // Always delete existing provenance lines when any template has been applied before
  // (covers re-applying the same template — prevents duplicate lines).
  if (bom!.labor_template_id) {
    const { error: clearError } = await supabase
      .from("product_bom_labor")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("product_bom_id", productBomId)
      .not("source_template_line_id", "is", null);
    if (clearError) {
      redirectVariantResult(variantId, { laborError: encodeMessage(clearError.message) });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: templateLines, error: linesError } = await (supabase as any)
    .from("labor_template_line")
    .select(
      "id,department_id,operation_name,sequence,setup_hours,run_hours_per_unit,admin_hours_per_unit,electricity_kwh_per_unit,gas_units_per_unit,blocked_by,notes"
    )
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId);
  if (linesError) {
    redirectVariantResult(variantId, { laborError: encodeMessage((linesError as { message: string }).message) });
  }

  const rows = ((templateLines ?? []) as Array<{ id: string; department_id: string; operation_name: string; sequence: number; setup_hours: number; run_hours_per_unit: number; admin_hours_per_unit: number; electricity_kwh_per_unit: number; gas_units_per_unit: number; blocked_by: number[]; notes: string | null }>).map(({ id, ...fields }) => ({
    ...fields,
    tenant_id: tenantId,
    product_bom_id: productBomId,
    source_template_line_id: id,
  }));

  if (rows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any).from("product_bom_labor").insert(rows);
    if (insertError) {
      redirectVariantResult(variantId, { laborError: encodeMessage((insertError as { message: string }).message) });
    }
  }

  const { error: linkError } = await supabase
    .from("product_bom")
    .update({ labor_template_id: templateId } as Record<string, unknown>)
    .eq("tenant_id", tenantId)
    .eq("id", productBomId);
  if (linkError) {
    redirectVariantResult(variantId, { laborError: encodeMessage(linkError.message) });
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/costing");
}
