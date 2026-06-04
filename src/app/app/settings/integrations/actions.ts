"use server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function setStatsOnlyBefore(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) return;
  if (ctx.role !== "admin" && ctx.role !== "super_admin") return;
  if (!ctx.tenantId) return; // platform operator with no active tenant
  const storeId = String(formData.get("store_id") ?? "").trim();
  if (!storeId) return;
  const raw = String(formData.get("stats_only_before") ?? "").trim();
  const value = raw === "" ? null : raw; // yyyy-mm-dd or null to clear
  await ctx.supabase
    .from("shopify_store")
    .update({ stats_only_before: value })
    .eq("id", storeId)
    .eq("tenant_id", ctx.tenantId);
  revalidatePath("/app/settings/integrations");
}
