"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

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
  revalidatePath(REVALIDATE);
}

export async function editWarehouse(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("location").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
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
  revalidatePath(REVALIDATE);
}

export async function editSubLocation(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_sub_location").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
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
  revalidatePath(REVALIDATE);
}

export async function editBay(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_bay").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
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
  revalidatePath(REVALIDATE);
  return {};
}
