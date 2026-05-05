import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptForm from "../receipt-form";

export default async function NewReceiptPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const [suppliersResult, componentsResult, locationsResult] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).order("name"),
    supabase.from("component").select("id, name, sku").eq("tenant_id", tenantId).order("name"),
    supabase.from("location").select("id, name, is_default").eq("tenant_id", tenantId).order("name"),
  ]);

  if (suppliersResult.error || componentsResult.error || locationsResult.error) {
    throw new Error("Failed to load form data");
  }

  const locations = locationsResult.data ?? [];
  if (locations.length === 0) {
    throw new Error("No locations configured — add a location before receiving stock");
  }

  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={componentsResult.data ?? []}
      locations={locations}
    />
  );
}
