"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function setDefaultLocation(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const locationId = formData.get("location_id")?.toString();
  if (!locationId) return { error: "No location selected." };

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(locationId)) return { error: "Invalid location ID." };

  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Unauthorized." };
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    return { error: "Admin access required." };
  }
  const { supabase, tenantId } = ctx;

  // Verify location belongs to this tenant before clearing.
  const { data: check } = await supabase
    .from("location")
    .select("id, name")
    .eq("id", locationId)
    .eq("tenant_id", tenantId!)
    .single();
  if (!check) return { error: "Location not found." };

  // Clear existing default (for all locations except the new one)
  const { error: clearError } = await supabase
    .from("location")
    .update({ is_default: false })
    .eq("tenant_id", tenantId!)
    .neq("id", locationId);
  if (clearError) return { error: clearError.message };

  // Set new default
  const { error: setError } = await supabase
    .from("location")
    .update({ is_default: true })
    .eq("id", locationId)
    .eq("tenant_id", tenantId!);
  if (setError) return { error: setError.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId!,
    actor_id: ctx.userId,
    event: "default_location_changed",
    metadata: {
      location_id: locationId,
      location_name: (check as { id: string; name: string }).name,
    },
  });

  revalidatePath("/app/settings/locations");
  return {};
}
