import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptForm from "../receipt-form";

type Props = {
  searchParams: Promise<{ po?: string; component_id?: string }>;
};

export default async function NewReceiptPage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { po: initialPoId, component_id: initialComponentId } = await searchParams;

  const [
    suppliersResult,
    componentsResult,
    locationsResult,
    supplierComponentResult,
    posResult,
  ] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).order("name"),
    supabase
      .from("component")
      .select("id, name, sku, unit, cost_per_unit, image_url, group:group_id(name)")
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase.from("location").select("id, name, is_default").eq("tenant_id", tenantId).order("name"),
    supabase
      .from("supplier_component")
      .select("supplier_id, component_id")
      .eq("tenant_id", tenantId),
    supabase
      .from("purchase_order")
      .select(
        "id, supplier_id, suppliers(name), purchase_order_line(id, component_id, quantity, quantity_received)"
      )
      .in("status", ["open", "in_transit"])
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
  ]);

  if (
    suppliersResult.error ||
    componentsResult.error ||
    locationsResult.error ||
    supplierComponentResult.error ||
    posResult.error
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
      image_url: (c.image_url as string | null) ?? null,
      group: (rawGroup as { name: string } | null)?.name ?? null,
    };
  });

  const supplierComponentMap: Record<string, string[]> = {};
  for (const row of supplierComponentResult.data ?? []) {
    const sid = row.supplier_id as string;
    const cid = row.component_id as string;
    (supplierComponentMap[sid] ??= []).push(cid);
  }

  const availablePOs = (posResult.data ?? []).map((po) => {
    const rawSupplier = Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers;
    return {
      id: po.id as string,
      supplier_id: po.supplier_id as string | null,
      supplier_name: (rawSupplier as { name: string } | null)?.name ?? null,
      lines: ((po.purchase_order_line ?? []) as Array<{
        id: string;
        component_id: string;
        quantity: number;
        quantity_received: number;
      }>).map((l) => ({
        id: l.id,
        component_id: l.component_id,
        quantity: l.quantity,
        quantity_received: l.quantity_received ?? 0,
      })),
    };
  });

  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={components}
      locations={locations}
      supplierComponentMap={supplierComponentMap}
      availablePOs={availablePOs}
      initialPoId={initialPoId}
      initialComponentId={initialComponentId ?? null}
    />
  );
}
