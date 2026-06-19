"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { logActivity } from "@/lib/activity/log";
import { evaluateBlockers } from "@/lib/housekeeping/blockers";

const REVALIDATE = "/app/warehouse/locations";

async function ctx() {
  const context = await getServerTenantContext();
  if (!context) throw new Error("Unauthorized");
  return context;
}

// ── Warehouse ────────────────────────────────────────────────

export async function addWarehouse(formData: FormData): Promise<{ error: string } | void> {
  const name = formData.get("name")?.toString().trim();
  if (!name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("location").insert({ tenant_id: tenantId, name, is_default: false });
  if (error) throw new Error(error.message);
  await logActivity({ event: "location.created", metadata: { name } });
  revalidatePath(REVALIDATE);
}

export async function editWarehouse(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("location").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  await logActivity({ event: "location.updated", metadata: { name } });
  revalidatePath(REVALIDATE);
}

// ── Sub-location ─────────────────────────────────────────────

export async function addSubLocation(formData: FormData): Promise<{ error: string } | void> {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!warehouseId || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_sub_location").insert({ tenant_id: tenantId, warehouse_id: warehouseId, name });
  if (error) throw new Error(error.message);
  await logActivity({ event: "sub_location.created", metadata: { name } });
  revalidatePath(REVALIDATE);
}

export async function editSubLocation(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_sub_location").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  await logActivity({ event: "sub_location.updated", metadata: { name } });
  revalidatePath(REVALIDATE);
}

export async function deleteSubLocation(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get("id")?.toString();
  if (!id) return {};
  const { supabase, tenantId } = await ctx();
  const { count } = await supabase
    .from("component")
    .select("id", { count: "exact", head: true })
    .eq("bin_sub_location_id", id)
    .eq("tenant_id", tenantId);
  if ((count ?? 0) > 0) return { error: `${count} component(s) assigned — reassign before deleting.` };
  const { error } = await supabase.from("bin_sub_location").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  await logActivity({ event: "sub_location.deleted" });
  revalidatePath(REVALIDATE);
  return {};
}

// ── Aisle ────────────────────────────────────────────────────

export async function addAisle(formData: FormData): Promise<{ error: string } | void> {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!warehouseId || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_aisle").insert({
    tenant_id: tenantId, warehouse_id: warehouseId, name, sub_location_id: subLocationId,
  });
  if (error) throw new Error(error.message);
  await logActivity({ event: "aisle.created", metadata: { name } });
  revalidatePath(REVALIDATE);
}

export async function editAisle(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!id || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase
    .from("bin_aisle")
    .update({ name, sub_location_id: subLocationId })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  await logActivity({ event: "aisle.updated", metadata: { name } });
  revalidatePath(REVALIDATE);
}

export async function deleteAisle(formData: FormData): Promise<{ error?: string; bayCount?: number }> {
  const id = formData.get("id")?.toString();
  if (!id) return {};
  const { supabase, tenantId } = await ctx();

  // Block if components are assigned to this aisle
  const { count: compCount } = await supabase
    .from("component")
    .select("id", { count: "exact", head: true })
    .eq("bin_aisle_id", id)
    .eq("tenant_id", tenantId);
  if ((compCount ?? 0) > 0) return { error: `${compCount} component(s) assigned — reassign before deleting.` };

  // If there are bays and user hasn't confirmed, return count for client-side confirmation
  const { count: bayCount } = await supabase
    .from("bin_bay")
    .select("id", { count: "exact", head: true })
    .eq("aisle_id", id)
    .eq("tenant_id", tenantId);
  const confirmed = formData.get("confirmed")?.toString() === "true";
  if ((bayCount ?? 0) > 0 && !confirmed) return { bayCount: bayCount ?? 0 };

  const { error } = await supabase.from("bin_aisle").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  await logActivity({ event: "aisle.deleted" });
  revalidatePath(REVALIDATE);
  return {};
}

// ── Bay ──────────────────────────────────────────────────────

export async function addBay(formData: FormData): Promise<{ error: string } | void> {
  const aisleId = formData.get("aisle_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!aisleId || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_bay").insert({ tenant_id: tenantId, aisle_id: aisleId, name });
  if (error) throw new Error(error.message);
  await logActivity({ event: "bay.created", metadata: { name } });
  revalidatePath(REVALIDATE);
}

export async function editBay(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_bay").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  await logActivity({ event: "bay.updated", metadata: { name } });
  revalidatePath(REVALIDATE);
}

export async function deleteBay(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get("id")?.toString();
  if (!id) return {};
  const { supabase, tenantId } = await ctx();
  const { count } = await supabase
    .from("component")
    .select("id", { count: "exact", head: true })
    .eq("bin_bay_id", id)
    .eq("tenant_id", tenantId);
  if ((count ?? 0) > 0) return { error: `${count} component(s) assigned — reassign before deleting.` };
  const { error } = await supabase.from("bin_bay").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  await logActivity({ event: "bay.deleted" });
  revalidatePath(REVALIDATE);
  return {};
}

// ── Delete Warehouse ──────────────────────────────────────────

export type DeleteWarehouseResult = { success: true } | { error: string };

export async function deleteWarehouse(id: string): Promise<DeleteWarehouseResult> {
  if (!id) return { success: true };
  const context = await getServerTenantContext();
  if (!context) return { error: "Unauthorized." };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "You do not have permission to delete warehouses." };
  }

  // Load the target for the default guard.
  const { data: target } = await supabase
    .from("location")
    .select("id,is_default")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!target) return { success: true }; // already gone — no-op

  if (target.is_default) {
    return { error: "Can't delete the default warehouse. Make another warehouse the default first." };
  }

  const { count: warehouseCount } = await supabase
    .from("location")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if ((warehouseCount ?? 0) <= 1) {
    return { error: "Can't delete the only warehouse. At least one warehouse must remain." };
  }

  // Reference checks — anything > 0 blocks the delete.
  const countRefs = async (
    table: "component" | "inventory_balance" | "inventory_movement" | "stocktake_session" | "delivery_receipt"
  ) => {
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("location_id", id);
    return count ?? 0;
  };

  const [components, balances, movements, stocktakes, deliveries] = await Promise.all([
    countRefs("component"),
    countRefs("inventory_balance"),
    countRefs("inventory_movement"),
    countRefs("stocktake_session"),
    countRefs("delivery_receipt"),
  ]);

  const verdict = evaluateBlockers([
    { label: "components assigned here", count: components },
    { label: "on-hand stock", count: balances },
    { label: "movement history", count: movements },
    { label: "stocktake sessions", count: stocktakes },
    { label: "goods-in receipts", count: deliveries },
  ]);
  if (verdict.blocked) return { error: verdict.reason! };

  // Clean — bins cascade via FK ON DELETE CASCADE on warehouse_id.
  const { error } = await supabase
    .from("location")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };

  await logActivity({ event: "location.deleted", entityId: id });
  revalidatePath(REVALIDATE);
  return { success: true };
}
