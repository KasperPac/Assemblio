import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { buildLocationsMap } from "../../_lib/build-locations-map";
import { StocktakeClient, type ScanLine } from "./stocktake-client";

interface Props {
  params: Promise<{ sessionId: string }>;
}

// Server Component: fetch the location map + ALL lines for this session once,
// so the client resolves barcodes and filters lines entirely in-browser.
export default async function StocktakeScanPage({ params }: Props) {
  const { sessionId } = await params;

  const context = await getServerTenantContext();
  if (!context || !context.tenantId) return notFound();
  const { supabase, tenantId } = context;

  const [locationsMap, sessionRes, linesRes] = await Promise.all([
    buildLocationsMap(supabase, tenantId),
    supabase
      .from("stocktake_session")
      .select("id, blind_count")
      .eq("id", sessionId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("stocktake_line")
      .select("id, component_id, expected_on_hand, counted, component:component_id(id, name, sku, bin_bay_id, bin_aisle_id, bin_sub_location_id, location_id)")
      .eq("session_id", sessionId)
      .eq("tenant_id", tenantId),
  ]);

  if (!sessionRes.data) return notFound();
  const isBlind = (sessionRes.data as { blind_count: boolean }).blind_count;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines: ScanLine[] = (linesRes.data ?? []).map((l: any) => {
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    return {
      id: l.id as string,
      componentId: l.component_id as string,
      name: (c?.name ?? "Unknown") as string,
      sku: (c?.sku ?? null) as string | null,
      expectedOnHand: isBlind ? null : (l.expected_on_hand as number),
      counted: l.counted as number | null,
      binBayId: (c?.bin_bay_id ?? null) as string | null,
      binAisleId: (c?.bin_aisle_id ?? null) as string | null,
      binSubLocationId: (c?.bin_sub_location_id ?? null) as string | null,
      locationId: (c?.location_id ?? null) as string | null,
    };
  });

  return (
    <StocktakeClient
      sessionId={sessionId}
      locationsMap={locationsMap}
      allLines={lines}
    />
  );
}
