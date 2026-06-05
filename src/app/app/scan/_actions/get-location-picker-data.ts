"use server";

import { getServerTenantContext } from "@/lib/tenant/context";

export type WarehouseItem = { id: string; name: string };
export type AisleItem = {
  id: string;
  name: string;
  warehouseId: string;
  subLocationName: string | null;
};
export type BayItem = { id: string; name: string };

export async function getWarehouses(): Promise<WarehouseItem[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;
  const { data } = await supabase
    .from("location")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name");
  return (data ?? []) as WarehouseItem[];
}

export async function getAislesForWarehouse(warehouseId: string): Promise<AisleItem[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;
  const { data } = await supabase
    .from("bin_aisle")
    .select("id, name, warehouse_id, sub_location:sub_location_id(name)")
    .eq("tenant_id", tenantId)
    .eq("warehouse_id", warehouseId)
    .order("name");
  return (data ?? []).map((row: any) => {
    const sl = Array.isArray(row.sub_location) ? row.sub_location[0] : row.sub_location;
    return {
      id: row.id as string,
      name: row.name as string,
      warehouseId: row.warehouse_id as string,
      subLocationName: (sl?.name ?? null) as string | null,
    };
  });
}

export async function getBaysForAisle(aisleId: string): Promise<BayItem[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;
  const { data } = await supabase
    .from("bin_bay")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("aisle_id", aisleId)
    .order("name");
  return (data ?? []) as BayItem[];
}
