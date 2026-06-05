"use server";

import { getServerTenantContext } from "@/lib/tenant/context";

export type ComponentSearchResult = { id: string; name: string; sku: string | null };

export async function searchComponents(query: string): Promise<ComponentSearchResult[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;

  if (!query.trim()) return [];

  const [nameRes, skuRes] = await Promise.all([
    supabase
      .from("component")
      .select("id, name, sku")
      .eq("tenant_id", tenantId)
      .ilike("name", `%${query}%`)
      .order("name")
      .limit(20),
    supabase
      .from("component")
      .select("id, name, sku")
      .eq("tenant_id", tenantId)
      .ilike("sku", `%${query}%`)
      .order("name")
      .limit(20),
  ]);

  const seen = new Set<string>();
  const merged = [...(nameRes.data ?? []), ...(skuRes.data ?? [])]
    .filter((r: any) => {
      const keep = !seen.has(r.id as string);
      seen.add(r.id as string);
      return keep;
    })
    .sort((a: any, b: any) => (a.name as string).localeCompare(b.name as string))
    .slice(0, 20);

  return merged as ComponentSearchResult[];
}
