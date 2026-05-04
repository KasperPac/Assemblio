import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptList from "./receipt-list";

export default async function GoodsInwardsPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: receipts } = await supabase
    .from("delivery_receipt")
    .select(
      `id, supplier_name_override, supplier_reference, purchase_order_id,
       status, received_at,
       supplier:supplier_id(name),
       location:location_id(name),
       delivery_receipt_line(id)`
    )
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false });

  return <ReceiptList receipts={receipts ?? []} />;
}
