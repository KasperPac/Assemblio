"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

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
  const { supabase, tenantId } = context;

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

  revalidatePath("/app/bom");
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

  revalidatePath("/app/bom");
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

  revalidatePath("/app/bom");
  revalidatePath("/app");
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

  const { error } = await supabase.from("product_bom_component").insert({
    tenant_id: tenantId,
    product_bom_id: productBomId,
    component_id: componentId,
    quantity,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/bom");
  return { success: "BOM component line added." };
}

export async function updateBomComponentQuantity(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
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
  revalidatePath("/app/bom");
}
