"use server";

import { getServerTenantContext } from "@/lib/tenant/context";

export type ComponentSearchResult = { id: string; name: string; sku: string | null };

export async function searchComponents(query: string): Promise<ComponentSearchResult[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;

  if (!query.trim()) return [];

  const { data } = await supabase
    .from("component")
    .select("id, name, sku")
    .eq("tenant_id", tenantId)
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
    .order("name")
    .limit(20);

  return (data ?? []) as ComponentSearchResult[];
}
