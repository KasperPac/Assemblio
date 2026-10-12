import type { SupabaseClient } from "@supabase/supabase-js";
import { squareFetch } from "@/lib/square/client";
import { getSquareAccess } from "@/lib/square/tokens";

export type SquareConnection = {
  id: string; tenant_id: string; sales_channel_id: string; merchant_id: string;
  environment: "production" | "sandbox"; status: "active" | "needs_reconnect" | "disconnected";
};
export type LocationOption = { id: string; name: string };

export async function listSquareLocations(db: SupabaseClient, conn: SquareConnection): Promise<LocationOption[]> {
  const response = await squareFetch<{ locations?: Array<{ id: string; name?: string; status?: string }> }>(
    await getSquareAccess(db, conn), "/v2/locations",
  );
  if (!response.ok) throw new Error("Couldn't read Square locations. Try again, or reconnect Square.");
  if (!Array.isArray(response.data.locations)) throw new Error("Square returned no location list. Try again.");
  return response.data.locations.filter((l) => l.id && l.status !== "INACTIVE")
    .map((l) => ({ id: l.id, name: l.name || l.id }));
}
