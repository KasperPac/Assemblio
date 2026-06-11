"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function restorePurchaseOrder(formData: FormData) {
  const id = formData.get("id")?.toString() ?? "";
  if (!id) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("purchase_order")
    .update({ status: "open" })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  revalidatePath("/app/trash");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/goods-inwards");
}

export async function restoreStocktakeSession(formData: FormData) {
  const id = formData.get("id")?.toString() ?? "";
  if (!id) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("stocktake_session")
    .update({ status: "open" })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  revalidatePath("/app/trash");
  revalidatePath("/app/stocktake");
}

export async function restoreBom(formData: FormData) {
  const id = formData.get("id")?.toString() ?? "";
  if (!id) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("product_bom")
    .update({ status: "draft", is_active: false })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  revalidatePath("/app/trash");
  revalidatePath("/app/templates");
  revalidatePath("/app");
}

function readErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: string }).message ?? "Unknown error");
  }
  return "Unknown error";
}

export async function emptyTrash() {
  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const [
    { data: archivedPoRows, error: archivedPoError },
    { data: archivedStocktakeRows, error: archivedStocktakeError },
    { data: archivedBomRows, error: archivedBomError },
  ] = await Promise.all([
    supabase.from("purchase_order").select("id").eq("tenant_id", tenantId).eq("status", "archived"),
    supabase.from("stocktake_session").select("id").eq("tenant_id", tenantId).eq("status", "archived"),
    supabase.from("product_bom").select("id").eq("tenant_id", tenantId).eq("status", "archived"),
  ]);

  if (archivedPoError || archivedStocktakeError || archivedBomError) {
    throw new Error(
      `Failed to read trash records: ${readErrorMessage(
        archivedPoError ?? archivedStocktakeError ?? archivedBomError
      )}`
    );
  }

  const poIds = (archivedPoRows ?? []).map((row) => row.id as string);
  const stocktakeIds = (archivedStocktakeRows ?? []).map((row) => row.id as string);
  const bomIds = (archivedBomRows ?? []).map((row) => row.id as string);

  if (poIds.length > 0) {
    const { error: poLinesError } = await supabase
      .from("purchase_order_line")
      .delete()
      .eq("tenant_id", tenantId)
      .in("purchase_order_id", poIds);
    if (poLinesError) {
      throw new Error(`Failed to delete archived PO lines: ${readErrorMessage(poLinesError)}`);
    }

    const { error: poDeleteError } = await supabase
      .from("purchase_order")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", poIds);
    if (poDeleteError) {
      throw new Error(`Failed to delete archived purchase orders: ${readErrorMessage(poDeleteError)}`);
    }
  }

  if (stocktakeIds.length > 0) {
    const { error: stocktakeLinesError } = await supabase
      .from("stocktake_line")
      .delete()
      .eq("tenant_id", tenantId)
      .in("session_id", stocktakeIds);
    if (stocktakeLinesError) {
      throw new Error(
        `Failed to delete archived stocktake lines: ${readErrorMessage(stocktakeLinesError)}`
      );
    }

    const { error: stocktakeDeleteError } = await supabase
      .from("stocktake_session")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", stocktakeIds);
    if (stocktakeDeleteError) {
      throw new Error(
        `Failed to delete archived stocktake sessions: ${readErrorMessage(stocktakeDeleteError)}`
      );
    }
  }

  if (bomIds.length > 0) {
    const { error: bomLinesError } = await supabase
      .from("product_bom_component")
      .delete()
      .eq("tenant_id", tenantId)
      .in("product_bom_id", bomIds);
    if (bomLinesError) {
      throw new Error(`Failed to delete archived BOM lines: ${readErrorMessage(bomLinesError)}`);
    }

    const { error: bomDeleteError } = await supabase
      .from("product_bom")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", bomIds);
    if (bomDeleteError) {
      throw new Error(`Failed to delete archived BOMs: ${readErrorMessage(bomDeleteError)}`);
    }
  }

  const { error: storesDeleteError } = await supabase
    .from("shopify_store")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("status", "uninstalled");
  if (storesDeleteError) {
    throw new Error(
      `Failed to delete uninstalled Shopify stores: ${readErrorMessage(storesDeleteError)}`
    );
  }

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "trash.emptied",
    metadata: {
      archivedPurchaseOrdersDeleted: poIds.length,
      archivedStocktakesDeleted: stocktakeIds.length,
      archivedBomsDeleted: bomIds.length,
    },
  });

  revalidatePath("/app/trash");
  revalidatePath("/app/templates");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/stocktake");
  revalidatePath("/app/settings");
}
