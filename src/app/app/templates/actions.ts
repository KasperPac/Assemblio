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
