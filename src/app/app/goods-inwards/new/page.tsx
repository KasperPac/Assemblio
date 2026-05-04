import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptForm from "../receipt-form";

export default async function NewReceiptPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const [suppliersResult, componentsResult, locationsResult, openPOsResult] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("component")
        .select("id, name, sku")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("location")
        .select("id, name, is_default")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("purchase_order")
        .select(
          `id, supplier_id,
           purchase_order_line(id, component_id, quantity, quantity_received,
             component:component_id(name, sku))`
        )
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .order("created_at", { ascending: false }),
    ]);

  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={componentsResult.data ?? []}
      locations={locationsResult.data ?? []}
      openPOs={openPOsResult.data ?? []}
    />
  );
}
