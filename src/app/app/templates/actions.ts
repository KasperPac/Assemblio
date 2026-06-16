"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPublishedLines, inheritStatus } from "@/lib/templates/publish";

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
  lines: { component_id: string; quantity: number; sort_order?: number }[]
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
    const rows = lines.map((l, i) => ({
      tenant_id: tenantId,
      template_id: templateId,
      component_id: l.component_id,
      quantity: l.quantity,
      sort_order: l.sort_order ?? i + 1,
    }));

    const { error: insertError } = await supabase
      .from("bom_template_line")
      .insert(rows);

    if (insertError) return { error: insertError.message };
  }

  const touchError = await touchTemplate(supabase, "bom_template", tenantId, templateId);
  revalidatePath("/app/templates");
  if (touchError) return { error: touchError };
  return {};
}

export async function reorderTemplateLines(
  templateId: string,
  orderedLineIds: string[]
): Promise<{ error?: string }> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const updates = orderedLineIds.map((id, index) =>
    supabase
      .from("bom_template_line")
      .update({ sort_order: index + 1 } as any)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("template_id", templateId)
  );

  await Promise.all(updates);

  const touchError = await touchTemplate(supabase, "bom_template", tenantId, templateId);
  revalidatePath("/app/templates");
  if (touchError) return { error: touchError };
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
  revalidatePath("/app/templates");
  if (touchError) return { error: touchError };
  return {};
}

// ---------------------------------------------------------------------------
// Dynamic linking & publish
// ---------------------------------------------------------------------------

export async function setTemplateLinked(
  templateType: "component" | "labor",
  templateId: string,
  isLinked: boolean
): Promise<{ error?: string }> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const table = templateType === "component" ? "bom_template" : "labor_template";
  const { error } = await supabase
    .from(table)
    .update({ is_linked: isLinked })
    .eq("tenant_id", tenantId)
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  return {};
}

export async function publishTemplate(
  templateType: "component" | "labor",
  templateId: string,
  selectedBomIds: string[]
): Promise<{ error?: string; success?: string }> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const templateTable = templateType === "component" ? "bom_template" : "labor_template";
  const lineTable = templateType === "component" ? "bom_template_line" : "labor_template_line";

  const { data: template } = await supabase
    .from(templateTable)
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .maybeSingle();
  if (!template?.id) return { error: "Template not found." };

  const { data: templateLines, error: tplLinesError } = await supabase
    .from(lineTable)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("template_id", templateId);
  if (tplLinesError) return { error: tplLinesError.message };

  const successes: string[] = [];
  const failures: string[] = [];

  for (const bomId of selectedBomIds) {
    const result = await publishToBom(
      supabase,
      tenantId,
      templateType,
      templateId,
      (templateLines ?? []) as TemplateLineRow[],
      bomId
    );
    if (result.error) failures.push(result.error);
    else successes.push(result.label!);
  }

  // Stamp when at least one BOM was successfully updated, or when zero were selected
  // (zero-select is an explicit "mark as up-to-date" intent). Do NOT stamp when all
  // selected BOMs failed — that would hide the "Unpublished changes" badge despite
  // nothing actually being published.
  if (successes.length > 0 || selectedBomIds.length === 0) {
    await supabase
      .from(templateTable)
      .update({ last_published_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", templateId);
  }

  revalidatePath("/app/templates");
  revalidatePath("/app/products");

  if (failures.length > 0) {
    const successPart =
      successes.length === 0
        ? "No BOMs updated"
        : `Updated ${successes.length} BOM${successes.length === 1 ? "" : "s"}`;
    return {
      error: `${successPart}; ${failures.length} failed: ${failures.join("; ")}`,
    };
  }
  return {
    success:
      selectedBomIds.length === 0
        ? "Marked as published (no BOMs selected)."
        : `Updated ${successes.length} BOM${successes.length === 1 ? "" : "s"}: ${successes.join(", ")}.`,
  };
}

type TemplateLineRow = Record<string, unknown> & { id: string };

async function publishToBom(
  supabase: SupabaseClient,
  tenantId: string | null,
  templateType: "component" | "labor",
  templateId: string,
  templateLines: TemplateLineRow[],
  bomId: string
): Promise<{ error?: string; label?: string }> {
  // 1. Load the latest version of this BOM's lineage.
  const { data: oldBom, error: bomError } = await supabase
    .from("product_bom")
    .select("id,variant_id,version,status,component_template_id,labor_template_id")
    .eq("tenant_id", tenantId)
    .eq("id", bomId)
    .maybeSingle();
  if (bomError || !oldBom) return { error: `BOM ${bomId}: not found` };

  const { data: newer } = await supabase
    .from("product_bom")
    .select("id,version")
    .eq("tenant_id", tenantId)
    .eq("variant_id", oldBom.variant_id)
    .gt("version", oldBom.version)
    .limit(1);
  if (newer && newer.length > 0) {
    return { error: `BOM v${oldBom.version}: a newer version already exists` };
  }

  const statusPlan = inheritStatus(oldBom.status);

  // 2. Insert the new version, copying both template-id columns.
  const { data: newBom, error: insertError } = await supabase
    .from("product_bom")
    .insert({
      tenant_id: tenantId,
      variant_id: oldBom.variant_id,
      version: (oldBom.version as number) + 1,
      status: statusPlan.newStatus,
      is_active: statusPlan.newIsActive,
      component_template_id: oldBom.component_template_id,
      labor_template_id: oldBom.labor_template_id,
    })
    .select("id")
    .single();
  if (insertError || !newBom?.id) {
    return { error: `BOM v${oldBom.version}: ${insertError?.message ?? "insert failed"}` };
  }

  const rollback = async () => {
    await supabase.from("product_bom").delete().eq("id", newBom.id);
  };

  // 3. Build and insert both line tables.
  const componentResult = await copyLines(
    supabase,
    tenantId,
    "product_bom_component",
    ["component_id", "quantity", "yield_pct", "position"],
    oldBom.id as string,
    newBom.id,
    templateType === "component" ? templateLines : null
  );
  if (componentResult.error) {
    await rollback();
    return { error: `BOM v${oldBom.version}: ${componentResult.error}` };
  }

  const laborResult = await copyLines(
    supabase,
    tenantId,
    "product_bom_labor",
    [
      "department_id",
      "operation_name",
      "sequence",
      "setup_hours",
      "run_hours_per_unit",
      "admin_hours_per_unit",
      "electricity_kwh_per_unit",
      "gas_units_per_unit",
      "blocked_by",
      "notes",
    ],
    oldBom.id as string,
    newBom.id,
    templateType === "labor" ? templateLines : null
  );
  if (laborResult.error) {
    await rollback();
    return { error: `BOM v${oldBom.version}: ${laborResult.error}` };
  }

  // 4. Status: old active → archived; old draft untouched.
  if (statusPlan.archiveOld) {
    await supabase
      .from("product_bom")
      .update({ status: "archived", is_active: false })
      .eq("tenant_id", tenantId)
      .eq("id", oldBom.id);
  }

  // 5. Activity log.
  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "bom.template_publish",
    metadata: {
      template_id: templateId,
      template_type: templateType,
      bom_id: newBom.id,
      old_version: oldBom.version,
      new_version: (oldBom.version as number) + 1,
    },
  });

  revalidatePath(`/app/products/variants/${oldBom.variant_id}`);
  return { label: `v${oldBom.version} → v${(oldBom.version as number) + 1}` };
}

/**
 * Copy one line table from old BOM to new BOM.
 * If currentTemplateLines is provided, this is the published type: template-provenance
 * lines are regenerated from the template via buildPublishedLines. Otherwise the
 * lines are copied verbatim, provenance included.
 *
 * For product_bom_labor: detects duplicate sequence values in the final merged line
 * set (collision between regenerated template lines and kept manual lines) and
 * returns an error rather than silently renumbering.
 */
async function copyLines(
  supabase: SupabaseClient,
  tenantId: string | null,
  table: "product_bom_component" | "product_bom_labor",
  fields: string[],
  oldBomId: string,
  newBomId: string,
  currentTemplateLines: TemplateLineRow[] | null
): Promise<{ error?: string }> {
  const selectStr = `${fields.join(",")},source_template_line_id`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawLines, error: readError } = await (supabase as any)
    .from(table)
    .select(selectStr)
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", oldBomId);
  if (readError) return { error: (readError as { message: string }).message };

  const oldLines = (rawLines ?? []) as (Record<string, unknown> & {
    source_template_line_id: string | null;
  })[];

  let lines: Record<string, unknown>[];
  if (currentTemplateLines) {
    // `id` is included in the projected object so buildPublishedLines can use it
    // as the new source_template_line_id. buildPublishedLines destructures `id`
    // out of the spread before building the output row, so `id` is never included
    // in the final insert rows — only `source_template_line_id` is set from it.
    const tplLines = currentTemplateLines.map((line) => {
      const projected: Record<string, unknown> = { id: line.id };
      for (const f of fields) {
        if (f in line) projected[f] = line[f];
      }
      return projected as { id: string } & Record<string, unknown>;
    });
    lines = buildPublishedLines(oldLines, tplLines);
  } else {
    lines = oldLines as Record<string, unknown>[];
  }

  if (lines.length === 0) return {};

  // Requirement A: detect sequence collisions for labor lines before inserting.
  if (table === "product_bom_labor") {
    const seqCounts = new Map<number, number>();
    for (const l of lines) {
      const seq = l.sequence as number | null;
      if (seq != null) {
        seqCounts.set(seq, (seqCounts.get(seq) ?? 0) + 1);
      }
    }
    for (const [seq, count] of seqCounts) {
      if (count > 1) {
        return {
          error: `sequence conflict: template operations and manually added operations share sequence ${seq}`,
        };
      }
    }
  }

  const rows = lines.map((l) => ({
    ...l,
    tenant_id: tenantId,
    product_bom_id: newBomId,
  }));

  const { error: insertError } = await supabase.from(table).insert(rows);
  if (insertError) return { error: insertError.message };
  return {};
}
