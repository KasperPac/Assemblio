"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
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
  if (!context) {
    return { error: "Missing tenant context." };
  }

  const { supabase, tenantId } = context;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role ?? "member";
  if (!BOM_EDITOR_ROLES.has(role)) {
    return {
      error: "Only admin and super_admin can create or copy BOMs.",
    };
  }

  return {
    supabase,
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
    .from("shopify_variant")
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
  revalidatePath("/app/bom");
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
    .from("shopify_variant")
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
  revalidatePath("/app/bom");
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
      .from("shopify_variant")
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
    .select("component_id,quantity,yield_pct")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", sourceBomId);

  if (sourceLinesError) {
    return { error: sourceLinesError.message };
  }

  const rowsToInsert = (sourceLines ?? []).map((line) => ({
    tenant_id: tenantId,
    product_bom_id: insertedBom.id,
    component_id: line.component_id,
    quantity: line.quantity,
    yield_pct: line.yield_pct ?? 1.0,
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
  revalidatePath("/app/bom");

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
      .from("shopify_variant")
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
    })
    .select("id")
    .single();

  if (bomError || !insertedBom?.id) {
    return { error: bomError?.message ?? "Failed to create BOM." };
  }

  const { data: templateLines, error: linesError } = await supabase
    .from("bom_template_line")
    .select("component_id,quantity")
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId);

  if (linesError) return { error: linesError.message };

  const rows = (templateLines ?? []).map((line) => ({
    tenant_id: tenantId,
    product_bom_id: insertedBom.id,
    component_id: line.component_id,
    quantity: line.quantity,
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
  revalidatePath("/app/bom");

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
  redirectVariantResult(variantId, {
    laborSuccess: encodeMessage(`Added labor operation "${operationName}".`),
  });
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

  const { error } = await supabase
    .from("product_bom_labor")
    .update({
      department_id: departmentId,
      operation_name: operationName,
      sequence,
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
  redirectVariantResult(variantId, {
    laborSuccess: encodeMessage(`Updated labor operation "${operationName}".`),
  });
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
  redirectVariantResult(variantId, {
    laborSuccess: encodeMessage("Removed labor operation."),
  });
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
    .select("component_id,quantity,yield_pct")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", sourceBomId);

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

  const rows = (sourceLines ?? []).map((l) => ({
    tenant_id: tenantId,
    product_bom_id: newBom.id,
    component_id: l.component_id,
    quantity: l.quantity,
    yield_pct: l.yield_pct ?? 1.0,
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
  revalidatePath("/app/bom");
  return { success: `Draft BOM v${version} created (${rows.length} lines).` };
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
