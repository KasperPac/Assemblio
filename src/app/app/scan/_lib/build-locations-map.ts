// Builds a shortCode → ResolvedLocation map from all location entities in the
// tenant. Fetches all 4 tables in parallel. Called server-side on page load.
// Client resolves barcodes locally with no network round-trip.

import type { ResolvedLocation } from "../_actions/resolve-barcode";

export type LocationsMap = Record<string, ResolvedLocation>;

function sc(id: string): string {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

function pick<T>(v: T | T[] | null | undefined): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildLocationsMap(supabase: any, tenantId: string): Promise<LocationsMap> {
  const [whRes, slRes, aisleRes, bayRes] = await Promise.all([
    supabase.from("location")
      .select("id, name")
      .eq("tenant_id", tenantId),
    supabase.from("bin_sub_location")
      .select("id, name, warehouse_id, warehouse:warehouse_id(name)")
      .eq("tenant_id", tenantId),
    supabase.from("bin_aisle")
      .select("id, name, warehouse_id, sub_location_id, sub_location:sub_location_id(name), warehouse:warehouse_id(name)")
      .eq("tenant_id", tenantId),
    supabase.from("bin_bay")
      .select("id, name, aisle_id, aisle:aisle_id(id, name, warehouse_id, sub_location_id, sub_location:sub_location_id(name), warehouse:warehouse_id(name))")
      .eq("tenant_id", tenantId),
  ]);

  const map: LocationsMap = {};

  for (const wh of whRes.data ?? []) {
    map[sc(wh.id)] = {
      type: "warehouse", id: wh.id, name: wh.name,
      path: wh.name, warehouseId: wh.id,
    };
  }

  for (const sl of slRes.data ?? []) {
    const wh = pick<{ name: string }>(sl.warehouse);
    map[sc(sl.id)] = {
      type: "sub_location", id: sl.id, name: sl.name,
      path: [wh?.name, sl.name].filter(Boolean).join(" · "),
      warehouseId: sl.warehouse_id,
    };
  }

  for (const a of aisleRes.data ?? []) {
    const wh = pick<{ name: string }>(a.warehouse);
    const sl = pick<{ name: string }>(a.sub_location);
    map[sc(a.id)] = {
      type: "aisle", id: a.id, name: a.name,
      path: [wh?.name, sl?.name, a.name].filter(Boolean).join(" · "),
      warehouseId: a.warehouse_id,
    };
  }

  for (const b of bayRes.data ?? []) {
    const aisle = pick<{
      id: string; name: string; warehouse_id: string;
      sub_location: { name: string } | { name: string }[] | null;
      warehouse: { name: string } | { name: string }[] | null;
    }>(b.aisle);
    const wh = pick<{ name: string }>(aisle?.warehouse);
    const sl = pick<{ name: string }>(aisle?.sub_location);
    map[sc(b.id)] = {
      type: "bay", id: b.id, name: b.name,
      path: [wh?.name, sl?.name, aisle?.name, b.name].filter(Boolean).join(" · "),
      warehouseId: aisle?.warehouse_id ?? "",
    };
  }

  return map;
}
