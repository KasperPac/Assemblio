import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { buildLocationsMap } from "../_lib/build-locations-map";
import { LocateClient, type ScanComponent } from "./locate-client";

// Server Component: fetch the full location map + all components ONCE on load,
// so the client can resolve barcodes and filter/search entirely in-browser
// with zero network round-trips per scan.
export default async function LocateScanPage() {
  const context = await getServerTenantContext();
  if (!context || !context.tenantId) return notFound();
  const { supabase, tenantId } = context;

  const [locationsMap, componentsRes] = await Promise.all([
    buildLocationsMap(supabase, tenantId),
    supabase
      .from("component")
      .select("id, name, sku, bin_bay_id, bin_aisle_id, bin_sub_location_id, location_id")
      .eq("tenant_id", tenantId)
      .order("name"),
  ]);

  const components = (componentsRes.data ?? []) as ScanComponent[];

  return <LocateClient locationsMap={locationsMap} allComponents={components} />;
}
