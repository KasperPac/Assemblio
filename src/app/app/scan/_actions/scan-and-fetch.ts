"use server";

// Combined actions: resolve barcode + fetch follow-on data in ONE server call.
// Internal queries that are independent are run in parallel with Promise.all.

import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";
import type { SessionLine } from "./get-session-lines";
import type { LocationComponent } from "./get-location-components";

// ── shared barcode resolver ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveCode(supabase: any, code: string): Promise<ResolvedLocation | null> {
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

// ── stocktake: resolve + session + lines in two parallel phases ───────────────

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

  // Phase 1 — both are independent; run in parallel
  const [location, sessionRes] = await Promise.all([
    resolveCode(supabase, code),
    supabase
      .from("stocktake_session")
      .select("id, blind_count")
      .eq("id", sessionId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (!location) return { found: false };
  if (!sessionRes.data) return { found: true, location, lines: [] };
  const isBlind = (sessionRes.data as { blind_count: boolean }).blind_count;

  // Phase 2 — single query: lines joined with component, filtered by bin location
  // PostgREST !inner filter lets us skip a separate component-IDs lookup
  const selectCols =
    "id, component_id, expected_on_hand, counted, " +
    "component:component_id!inner(id, name, sku, bin_bay_id, bin_aisle_id, bin_sub_location_id, location_id)";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("stocktake_line")
    .select(selectCols)
    .eq("session_id", sessionId)
    .eq("tenant_id", tenantId);

  if (location.type === "bay") {
    q = q.eq("component.bin_bay_id", location.id);
  } else if (location.type === "aisle") {
    q = q.eq("component.bin_aisle_id", location.id);
  } else if (location.type === "sub_location") {
    q = q.eq("component.bin_sub_location_id", location.id);
  } else {
    // warehouse level — components assigned to warehouse with no bin set
    q = q
      .eq("component.location_id", location.warehouseId)
      .is("component.bin_bay_id", null)
      .is("component.bin_aisle_id", null)
      .is("component.bin_sub_location_id", null);
  }

  const { data: lineRows } = await q;

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

// ── locate: resolve + components in two parallel phases ──────────────────────

export type ScanAndFetchComponentsResult =
  | { found: false }
  | { found: true; location: ResolvedLocation; components: LocationComponent[] };

export async function scanAndFetchComponents(
  code: string
): Promise<ScanAndFetchComponentsResult> {
  const context = await getServerTenantContext();
  if (!context) return { found: false };
  const { supabase, tenantId } = context;

  const location = await resolveCode(supabase, code);
  if (!location) return { found: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("component")
    .select("id, name, sku")
    .eq("tenant_id", tenantId)
    .order("name");

  if (location.type === "bay")               q = q.eq("bin_bay_id", location.id);
  else if (location.type === "aisle")        q = q.eq("bin_aisle_id", location.id);
  else if (location.type === "sub_location") q = q.eq("bin_sub_location_id", location.id);
  else q = q
    .eq("location_id", location.warehouseId)
    .is("bin_bay_id", null)
    .is("bin_aisle_id", null)
    .is("bin_sub_location_id", null);

  const { data } = await q;
  return { found: true, location, components: (data ?? []) as LocationComponent[] };
}
