"use server";

// Combined actions that resolve a barcode AND fetch the follow-on data in a
// single server round-trip, halving the latency on every scan.

import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";
import type { SessionLine } from "./get-session-lines";
import type { LocationComponent } from "./get-location-components";

// ── shared barcode resolver (inline, avoids an extra import hop) ──────────────

async function resolveCode(code: string): Promise<ResolvedLocation | null> {
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

// ── stocktake: resolve barcode + fetch session lines ─────────────────────────

export type ScanAndFetchLinesResult =
  | { found: false }
  | { found: true; location: ResolvedLocation; lines: SessionLine[] };

export async function scanAndFetchLines(
  code: string,
  sessionId: string
): Promise<ScanAndFetchLinesResult> {
  const context = await getServerTenantContext();
  if (!context) return { found: false };
  const { supabase, tenantId } = context;

  const location = await resolveCode(code);
  if (!location) return { found: false };

  // Fetch session blind_count + component IDs at location + lines — all with
  // the same tenant context, no extra round-trips.
  const { data: session } = await supabase
    .from("stocktake_session")
    .select("id, blind_count")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!session) return { found: true, location, lines: [] };
  const isBlind = (session as { blind_count: boolean }).blind_count;

  let compQuery = supabase.from("component").select("id").eq("tenant_id", tenantId);
  if (location.type === "bay")          compQuery = compQuery.eq("bin_bay_id", location.id);
  else if (location.type === "aisle")   compQuery = compQuery.eq("bin_aisle_id", location.id);
  else if (location.type === "sub_location") compQuery = compQuery.eq("bin_sub_location_id", location.id);
  else compQuery = compQuery.eq("location_id", location.warehouseId).is("bin_bay_id", null).is("bin_aisle_id", null).is("bin_sub_location_id", null);

  const { data: components } = await compQuery;
  const componentIds = (components ?? []).map((c: { id: string }) => c.id);
  if (componentIds.length === 0) return { found: true, location, lines: [] };

  const { data: lineRows } = await supabase
    .from("stocktake_line")
    .select("id, component_id, expected_on_hand, counted, component:component_id(id, name, sku)")
    .eq("session_id", sessionId)
    .eq("tenant_id", tenantId)
    .in("component_id", componentIds);

  const lines: SessionLine[] = (lineRows ?? []).map((l: any) => {
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

  return { found: true, location, lines };
}

// ── locate: resolve barcode + fetch components at location ───────────────────

export type ScanAndFetchComponentsResult =
  | { found: false }
  | { found: true; location: ResolvedLocation; components: LocationComponent[] };

export async function scanAndFetchComponents(
  code: string
): Promise<ScanAndFetchComponentsResult> {
  const context = await getServerTenantContext();
  if (!context) return { found: false };
  const { supabase, tenantId } = context;

  const location = await resolveCode(code);
  if (!location) return { found: false };

  let query = supabase.from("component").select("id, name, sku").eq("tenant_id", tenantId).order("name");
  if (location.type === "bay")          query = query.eq("bin_bay_id", location.id);
  else if (location.type === "aisle")   query = query.eq("bin_aisle_id", location.id);
  else if (location.type === "sub_location") query = query.eq("bin_sub_location_id", location.id);
  else query = query.eq("location_id", location.warehouseId).is("bin_bay_id", null).is("bin_aisle_id", null).is("bin_sub_location_id", null);

  const { data } = await query;
  return {
    found: true,
    location,
    components: (data ?? []) as LocationComponent[],
  };
}
