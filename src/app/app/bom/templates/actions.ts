"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

type ActionState = {
  error?: string;
  success?: string;
};

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

  revalidatePath("/app/bom/templates");
  return { success: `Template "${name}" created.` };
}

export async function addTemplateLine(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const templateId = formData.get("template_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const quantity = Number(formData.get("quantity") ?? 0);

  if (!templateId || !componentId) return { error: "Template and component are required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("bom_template_line").insert({
    tenant_id: tenantId,
    template_id: templateId,
    component_id: componentId,
    quantity,
  });

  if (error) return { error: error.message };

  revalidatePath("/app/bom/templates");
  return { success: "Line added." };
}

export async function removeTemplateLine(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const lineId = formData.get("line_id")?.toString() ?? "";
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

  revalidatePath("/app/bom/templates");
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

  const { error } = await supabase
    .from("bom_template")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath("/app/bom/templates");
  return { success: "Template deleted." };
}

export async function setTemplateLines(
  templateId: string,
  lines: { component_id: string; quantity: number }[]
): Promise<{ error?: string }> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  // Delete existing lines for this template
  const { error: delError } = await supabase
    .from("bom_template_line")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId);

  if (delError) return { error: delError.message };

  // Insert new lines
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

  revalidatePath("/app/bom/templates");
  return {};
}
