"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";

type LocType = ResolvedLocation["type"];

function buildUpdate(id: string, type: LocType): Record<string, string | null> {
  if (type === "bay")          return { bin_bay_id: id, bin_aisle_id: null, bin_sub_location_id: null };
  if (type === "aisle")        return { bin_aisle_id: id, bin_bay_id: null, bin_sub_location_id: null };
  if (type === "sub_location") return { bin_sub_location_id: id, bin_bay_id: null, bin_aisle_id: null };
  return { location_id: id, bin_bay_id: null, bin_aisle_id: null, bin_sub_location_id: null }; // warehouse
}

function buildClear(type: LocType): Record<string, null> {
  if (type === "bay")          return { bin_bay_id: null };
  if (type === "aisle")        return { bin_aisle_id: null };
  if (type === "sub_location") return { bin_sub_location_id: null };
  return { location_id: null }; // warehouse
}

export async function assignComponentToLocation(
  componentId: string,
  locationId: string,
  locationType: LocType
): Promise<{ ok: boolean }> {
  const context = await getServerTenantContext();
  if (!context) return { ok: false };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update(buildUpdate(locationId, locationType))
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false };
  revalidatePath("/app/components");
  return { ok: true };
}

export async function removeComponentFromLocation(
  componentId: string,
  locationType: LocType
): Promise<{ ok: boolean }> {
  const context = await getServerTenantContext();
  if (!context) return { ok: false };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update(buildClear(locationType))
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false };
  revalidatePath("/app/components");
  return { ok: true };
}
