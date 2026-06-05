"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";

export type LocationComponent = { id: string; name: string; sku: string | null };

export async function getLocationComponents(location: ResolvedLocation): Promise<LocationComponent[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;

  let query = supabase
    .from("component")
    .select("id, name, sku")
    .eq("tenant_id", tenantId)
    .order("name");

  if (location.type === "bay") {
    query = query.eq("bin_bay_id", location.id);
  } else if (location.type === "aisle") {
    query = query.eq("bin_aisle_id", location.id);
  } else if (location.type === "sub_location") {
    query = query.eq("bin_sub_location_id", location.id);
  } else {
    query = query
      .eq("location_id", location.warehouseId)
      .is("bin_bay_id", null)
      .is("bin_aisle_id", null)
      .is("bin_sub_location_id", null);
  }

  const { data } = await query;
  return (data ?? []) as LocationComponent[];
}
