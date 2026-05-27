import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import SlaForm from "./sla-form";

type SlaRow = { source: string; lead_time_days: number };

export default async function OrdersSettingsPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const { data } = await supabase
    .from("order_source_sla")
    .select("source, lead_time_days")
    .eq("tenant_id", tenantId);

  const rows = (data ?? []) as SlaRow[];
  const shopifyDays =
    rows.find((r) => r.source === "shopify")?.lead_time_days ?? 7;
  const manualDays =
    rows.find((r) => r.source === "manual")?.lead_time_days ?? 10;

  return (
    <div>
      <PageHeader description="Configure default delivery targets per order source." />
      <SlaForm shopifyDays={shopifyDays} manualDays={manualDays} />
    </div>
  );
}
