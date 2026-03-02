"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import type { SupabaseClient } from "@supabase/supabase-js";

type BomActionState = {
  error?: string;
  success?: string;
};

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
    .select("component_id,quantity")
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
