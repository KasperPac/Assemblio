"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";

export async function setDefaultLocation(formData: FormData): Promise<void> {
  const ctx = await getServerTenantContext();
  if (!ctx) throw new Error("Not authenticated");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    throw new Error("Admin access required");
  }

  const locationId = formData.get("location_id") as string;
  if (!locationId) throw new Error("Location ID required");

  const { error: clearError } = await ctx.supabase
    .from("location")
    .update({ is_default: false })
    .neq("id", locationId);

  if (clearError) throw new Error(clearError.message);

  const { error: setError } = await ctx.supabase
    .from("location")
    .update({ is_default: true })
    .eq("id", locationId);

  if (setError) throw new Error(setError.message);

  revalidatePath("/app/settings/locations");
}
