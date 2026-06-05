"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";

export type SessionLine = {
  id: string;
  componentId: string;
  name: string;
  sku: string | null;
  expectedOnHand: number | null; // null when session has blind_count = true
  counted: number | null;
};

export async function getSessionLines(
  sessionId: string,
  location: ResolvedLocation
): Promise<SessionLine[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;

  // 1. Check session exists and get blind_count flag
  const { data: session } = await supabase
    .from("stocktake_session")
    .select("id, blind_count")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!session) return [];
  const isBlind = (session as { blind_count: boolean }).blind_count;

  // 2. Find component IDs at this location level
  let compQuery = supabase
    .from("component")
    .select("id")
    .eq("tenant_id", tenantId);

  if (location.type === "bay") {
    compQuery = compQuery.eq("bin_bay_id", location.id);
  } else if (location.type === "aisle") {
    compQuery = compQuery.eq("bin_aisle_id", location.id);
  } else if (location.type === "sub_location") {
    compQuery = compQuery.eq("bin_sub_location_id", location.id);
  } else {
    // warehouse: no bin set, assigned to this warehouse location
    compQuery = compQuery
      .eq("location_id", location.warehouseId)
      .is("bin_bay_id", null)
      .is("bin_aisle_id", null)
      .is("bin_sub_location_id", null);
  }

  const { data: components } = await compQuery;
  const componentIds = (components ?? []).map((c: { id: string }) => c.id);
  if (componentIds.length === 0) return [];

  // 3. Fetch stocktake lines for those components in this session
  const { data: lines } = await supabase
    .from("stocktake_line")
    .select("id, component_id, expected_on_hand, counted, component:component_id(id, name, sku)")
    .eq("session_id", sessionId)
    .eq("tenant_id", tenantId)
    .in("component_id", componentIds);

  return (lines ?? []).map((l: any) => {
    const comp = Array.isArray(l.component) ? l.component[0] : l.component;
    return {
      id: l.id as string,
      componentId: l.component_id as string,
      name: (comp?.name ?? "Unknown") as string,
      sku: (comp?.sku ?? null) as string | null,
      expectedOnHand: isBlind ? null : (l.expected_on_hand as number),
      counted: l.counted as number | null,
    };
  });
}
