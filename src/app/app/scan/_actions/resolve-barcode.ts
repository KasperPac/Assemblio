"use server";

import { getServerTenantContext } from "@/lib/tenant/context";

export type ResolvedLocation = {
  type: "warehouse" | "sub_location" | "aisle" | "bay";
  id: string;
  name: string;
  path: string;
  warehouseId: string;
};

export async function resolveBarcode(code: string): Promise<ResolvedLocation | null> {
  const context = await getServerTenantContext();
  if (!context) return null;

  const { supabase } = context;
  const { data, error } = await supabase.rpc("resolve_location_barcode", {
    p_code: code.toUpperCase(),
  });

  if (error || !data) return null;

  return {
    type: data.type as ResolvedLocation["type"],
    id: data.id as string,
    name: data.name as string,
    path: data.path as string,
    warehouseId: data.warehouse_id as string,
  };
}
