"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import type { SupabaseClient } from "@supabase/supabase-js";

type ActionState = {
  error?: string;
  success?: string;
};

async function touchTemplate(
  supabase: SupabaseClient,
  table: "bom_template" | "labor_template",
  tenantId: string | null,
  templateId: string
): Promise<string | null> {
  const { error } = await supabase
    .from(table)
    .update({ lines_updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", templateId);
  if (error) {
    console.error("[touchTemplate] failed to stamp lines_updated_at:", error.message);
    return error.message;
  }
  return null;
}

export async function createTemplate(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";

  if (!name) return { error: "Template name is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("bom_template").insert({
    tenant_id: tenantId,
    name,
    description: description || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  return { success: `Template "${name}" created.` };
}

export async function removeTemplateLine(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const templateId = formData.get("template_id")?.toString() ?? "";
  if (!lineId) return { error: "Line ID required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("bom_template_line")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  if (error) return { error: error.message };

  if (templateId) {
    const touchError = await touchTemplate(supabase, "bom_template", tenantId, templateId);
    if (touchError) return { error: touchError };
  }
  revalidatePath("/app/templates");
  return { success: "Line removed." };
}

export async function deleteTemplate(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const templateId = formData.get("template_id")?.toString() ?? "";
  if (!templateId) return { error: "Template ID required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  // Deleting a template never breaks BOMs: provenance FKs are on delete set null.
  const { error } = await supabase
    .from("bom_template")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  return { success: "Template deleted." };
}

export async function setTemplateLines(
  templateId: string,
  lines: { component_id: string; quantity: number }[]
): Promise<{ error?: string }> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error: delError } = await supabase
    .from("bom_template_line")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId);

  if (delError) return { error: delError.message };

  if (lines.length > 0) {
    const rows = lines.map((l) => ({
      tenant_id: tenantId,
      template_id: templateId,
      component_id: l.component_id,
      quantity: l.quantity,
    }));

    const { error: insertError } = await supabase
      .from("bom_template_line")
      .insert(rows);

    if (insertError) return { error: insertError.message };
  }

  const touchError = await touchTemplate(supabase, "bom_template", tenantId, templateId);
  if (touchError) return { error: touchError };
  revalidatePath("/app/templates");
  return {};
}

// ---------------------------------------------------------------------------
// Labor template CRUD
// ---------------------------------------------------------------------------

export type LaborTemplateLineInput = {
  department_id: string;
  operation_name: string;
  sequence: number;
  setup_hours: number;
  run_hours_per_unit: number;
  admin_hours_per_unit: number;
  electricity_kwh_per_unit: number;
  gas_units_per_unit: number;
  notes: string | null;
};

export async function createLaborTemplate(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const mode = formData.get("mode")?.toString() === "advanced" ? "advanced" : "basic";

  if (!name) return { error: "Template name is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("labor_template").insert({
    tenant_id: tenantId,
    name,
    description: description || null,
    mode,
  });

  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  return { success: `Labor template "${name}" created.` };
}

export async function updateLaborTemplateMode(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const templateId = formData.get("template_id")?.toString() ?? "";
  const mode = formData.get("mode")?.toString() === "advanced" ? "advanced" : "basic";
  if (!templateId) return { error: "Template ID required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("labor_template")
    .update({ mode })
    .eq("tenant_id", tenantId)
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  return { success: `Mode set to ${mode}.` };
}

export async function deleteLaborTemplate(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const templateId = formData.get("template_id")?.toString() ?? "";
  if (!templateId) return { error: "Template ID required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("labor_template")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  return { success: "Labor template deleted." };
}

export async function setLaborTemplateLines(
  templateId: string,
  lines: LaborTemplateLineInput[]
): Promise<{ error?: string }> {
  // Validate each line
  for (const line of lines) {
    if (!line.department_id || !line.operation_name.trim()) {
      return { error: "Every operation needs a department and a name." };
    }
    if (
      !Number.isFinite(line.sequence) ||
      !Number.isInteger(line.sequence) ||
      line.sequence < 1 ||
      [
        line.setup_hours,
        line.run_hours_per_unit,
        line.admin_hours_per_unit,
        line.electricity_kwh_per_unit,
        line.gas_units_per_unit,
      ].some((v) => !Number.isFinite(v) || v < 0)
    ) {
      return { error: "Values cannot be negative, and sequence must be a whole number of at least 1." };
    }
  }

  // Reject duplicate sequence values
  const seqCounts = new Map<number, number>();
  for (const line of lines) {
    seqCounts.set(line.sequence, (seqCounts.get(line.sequence) ?? 0) + 1);
  }
  if ([...seqCounts.values()].some((count) => count > 1)) {
    return { error: "Each operation needs a unique sequence number." };
  }

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error: delError } = await supabase
    .from("labor_template_line")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId);

  if (delError) return { error: delError.message };

  if (lines.length > 0) {
    const rows = lines.map((l) => ({
      tenant_id: tenantId,
      template_id: templateId,
      department_id: l.department_id,
      operation_name: l.operation_name.trim(),
      sequence: l.sequence,
      setup_hours: l.setup_hours,
      run_hours_per_unit: l.run_hours_per_unit,
      admin_hours_per_unit: l.admin_hours_per_unit,
      electricity_kwh_per_unit: l.electricity_kwh_per_unit,
      gas_units_per_unit: l.gas_units_per_unit,
      notes: l.notes,
    }));

    const { error: insertError } = await supabase
      .from("labor_template_line")
      .insert(rows);

    if (insertError) return { error: insertError.message };
  }

  const touchError = await touchTemplate(supabase, "labor_template", tenantId, templateId);
  if (touchError) return { error: touchError };
  revalidatePath("/app/templates");
  return {};
}
