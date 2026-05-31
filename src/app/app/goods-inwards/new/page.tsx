import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptForm from "../receipt-form";

type Props = {
  searchParams?: Promise<{ component_id?: string }>;
};

export default async function NewReceiptPage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;
  const params = (await searchParams) ?? {};
  const initialComponentId = params.component_id ?? null;

  const [suppliersResult, componentsResult, locationsResult, supplierComponentResult] =
    await Promise.all([
      supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("component")
        .select("id, name, sku, unit, cost_per_unit, group:group_id(name)")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase.from("location").select("id, name, is_default").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("supplier_component")
        .select("supplier_id, component_id")
        .eq("tenant_id", tenantId),
    ]);

  if (
    suppliersResult.error ||
    componentsResult.error ||
    locationsResult.error ||
    supplierComponentResult.error
  ) {
    throw new Error("Failed to load form data");
  }

  const locations = locationsResult.data ?? [];
  if (locations.length === 0) {
    throw new Error("No locations configured — add a location before receiving stock");
  }

  const components = (componentsResult.data ?? []).map((c) => {
    const rawGroup = Array.isArray(c.group) ? c.group[0] : c.group;
    return {
      id: c.id as string,
      name: c.name as string,
      sku: (c.sku as string | null) ?? null,
      unit: (c.unit as string | null) ?? null,
      cost_per_unit: (c.cost_per_unit as number | null) ?? null,
      group: (rawGroup as { name: string } | null)?.name ?? null,
    };
  });

  const supplierComponentMap: Record<string, string[]> = {};
  for (const row of supplierComponentResult.data ?? []) {
    const sid = row.supplier_id as string;
    const cid = row.component_id as string;
    (supplierComponentMap[sid] ??= []).push(cid);
  }

  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={components}
      locations={locations}
      supplierComponentMap={supplierComponentMap}
      initialComponentId={initialComponentId}
    />
  );
}
