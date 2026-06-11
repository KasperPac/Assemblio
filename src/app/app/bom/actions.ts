"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type BomState = {
  error?: string;
  success?: string;
};

function parseVersion(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createBom(
  _prevState: BomState,
  formData: FormData
): Promise<BomState> {
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "draft";
  const requestedVersion = parseVersion(formData.get("version"));
  const isActive = formData.get("is_active") === "on";

  if (!variantId) {
    return { error: "Variant is required." };
  }

  const context = await getServerTenantContext();
  if (!context) {
    return { error: "Missing tenant context." };
  }
  const { supabase: regularClient, tenantId, role } = context;
  // Super-admins viewing as a tenant bypass RLS via the admin client.
  const supabase = role === "super_admin" ? createSupabaseAdminClient() : regularClient;

  let version = requestedVersion;
  if (!version || version <= 0) {
    const { data: latestBom } = await supabase
      .from("product_bom")
      .select("version")
      .eq("tenant_id", tenantId)
      .eq("variant_id", variantId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    version = Number(latestBom?.version ?? 0) + 1;
  }

  if (isActive) {
    await supabase
      .from("product_bom")
      .update({ is_active: false })
      .eq("variant_id", variantId)
      .eq("tenant_id", tenantId);
  }

  const { error } = await supabase.from("product_bom").insert({
    tenant_id: tenantId,
    variant_id: variantId,
    version,
    status,
    is_active: isActive,
  });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/app/templates");
  revalidatePath("/app");
  return { success: "BOM created." };
}

export async function updateBomStatus(formData: FormData) {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";
  if (!bomId || !status) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  if (status === "archived") {
    await supabase
      .from("product_bom")
      .update({ status, is_active: false })
      .eq("tenant_id", tenantId)
      .eq("id", bomId);
  } else {
    await supabase
      .from("product_bom")
      .update({ status })
      .eq("tenant_id", tenantId)
      .eq("id", bomId);
  }

  revalidatePath("/app/templates");
  revalidatePath("/app");
  revalidatePath("/app/trash");
}

export async function setBomActive(formData: FormData) {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  if (!bomId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: bom } = await supabase
    .from("product_bom")
    .select("id,variant_id")
    .eq("tenant_id", tenantId)
    .eq("id", bomId)
    .maybeSingle();
  if (!bom?.variant_id) return;

  await supabase
    .from("product_bom")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("variant_id", bom.variant_id);
  await supabase
    .from("product_bom")
    .update({ is_active: true, status: "active" })
    .eq("tenant_id", tenantId)
    .eq("id", bom.id);

  revalidatePath("/app/templates");
  revalidatePath("/app");
  revalidatePath(`/app/products/variants/${bom.variant_id}`);
}

export async function setBomArchived(formData: FormData) {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  if (!bomId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: bom } = await supabase
    .from("product_bom")
    .select("id,variant_id")
    .eq("tenant_id", tenantId)
    .eq("id", bomId)
    .maybeSingle();
  if (!bom?.variant_id) return;

  await supabase
    .from("product_bom")
    .update({ status: "archived", is_active: false })
    .eq("tenant_id", tenantId)
    .eq("id", bom.id);

  revalidatePath("/app/templates");
  revalidatePath("/app");
  revalidatePath(`/app/products/variants/${bom.variant_id}`);
}

export async function createBomComponentLine(
  _prevState: BomState,
  formData: FormData
): Promise<BomState> {
  const productBomId = formData.get("product_bom_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const quantity = parseNumber(formData.get("quantity"));
  if (!productBomId || !componentId || quantity === null) {
    return { error: "BOM, component, and quantity are required." };
  }

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { data: maxRow } = await supabase
    .from("product_bom_component")
    .select("position")
    .eq("product_bom_id", productBomId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxRow?.position ?? 0) + 1;

  const { error } = await supabase.from("product_bom_component").insert({
    tenant_id: tenantId,
    product_bom_id: productBomId,
    component_id: componentId,
    quantity,
    position,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  return { success: "BOM component line added." };
}

export async function updateBomComponentQuantity(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const quantity = parseNumber(formData.get("quantity"));
  if (!lineId || quantity === null) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("product_bom_component")
    .update({ quantity })
    .eq("tenant_id", tenantId)
    .eq("id", lineId);
  revalidatePath("/app/templates");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
}

export async function updateBomComponentYieldPct(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const raw = parseNumber(formData.get("yield_pct"));
  if (!lineId || raw === null) return;

  // Accept either a decimal (0.85) or a percentage (85) — normalise to decimal
  const yieldPct = raw > 1 ? raw / 100 : raw;
  if (yieldPct <= 0 || yieldPct > 1) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("product_bom_component")
    .update({ yield_pct: yieldPct })
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  revalidatePath("/app/templates");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
}

export async function removeBomComponentLine(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  if (!lineId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("product_bom_component")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  revalidatePath("/app/templates");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
}

export async function reorderBomComponents(bomId: string, orderedIds: string[]) {
  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase: regularClient, tenantId, role } = context;
  const supabase = role === "super_admin" ? createSupabaseAdminClient() : regularClient;

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("product_bom_component")
      .update({ position: index + 1 })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("product_bom_id", bomId)
  );

  await Promise.all(updates);

  const { data: bom } = await supabase
    .from("product_bom")
    .select("variant_id")
    .eq("id", bomId)
    .maybeSingle();

  revalidatePath("/app/templates");
  if (bom?.variant_id) revalidatePath(`/app/products/variants/${bom.variant_id}`);
}

export async function deleteBomDraft(formData: FormData) {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  if (!bomId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: bom } = await supabase
    .from("product_bom")
    .select("id,variant_id,is_active")
    .eq("tenant_id", tenantId)
    .eq("id", bomId)
    .maybeSingle();

  // Safety: never delete an active BOM
  if (!bom || bom.is_active) return;

  await supabase
    .from("product_bom_component")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", bomId);

  await supabase
    .from("product_bom")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", bomId);

  const vid = variantId || bom.variant_id;
  revalidatePath("/app/templates");
  revalidatePath("/app");
  if (vid) revalidatePath(`/app/products/variants/${vid}`);
}

export async function addComponentsToBom(
  _prevState: BomState,
  formData: FormData
): Promise<BomState> {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const linesJson = formData.get("lines")?.toString() ?? "[]";

  if (!bomId) return { error: "BOM is required." };

  let lines: Array<{ component_id: string; quantity: number; yield_pct?: number }>;
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Invalid component data." };
  }

  if (lines.length === 0) return { error: "Select at least one component." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { data: maxRow } = await supabase
    .from("product_bom_component")
    .select("position")
    .eq("product_bom_id", bomId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startPosition = (maxRow?.position ?? 0) + 1;

  const rows = lines
    .filter((l) => l.quantity > 0)
    .map((l, i) => ({
      tenant_id: tenantId,
      product_bom_id: bomId,
      component_id: l.component_id,
      quantity: l.quantity,
      yield_pct: l.yield_pct ?? 1.0,
      position: startPosition + i,
    }));

  if (rows.length === 0) return { error: "All selected components have quantity 0." };

  const { error } = await supabase.from("product_bom_component").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/app/templates");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
  return { success: `Added ${rows.length} component(s).` };
}
