import { notFound, redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptDetail from "../receipt-detail";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ReceiptDetailPage({ params }: Props) {
  const { id } = await params;

  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const [{ data: receipt }, { data: suppliers }, { data: locations }] =
    await Promise.all([
      supabase
        .from("delivery_receipt")
        .select(
          `id, supplier_id, supplier_name_override, supplier_reference, purchase_order_id,
           status, received_at, notes, stock_in_reason, created_at,
           supplier:supplier_id(name),
           location:location_id(id, name),
           delivery_receipt_line(
             id, component_id, quantity_delivered, quantity_expected, notes,
             component:component_id(name, sku)
           )`
        )
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single(),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("location")
        .select("id, name, is_default")
        .eq("tenant_id", tenantId)
        .order("name"),
    ]);

  if (!receipt) notFound();

  return (
    <ReceiptDetail
      receipt={receipt}
      suppliers={suppliers ?? []}
      locations={locations ?? []}
    />
  );
}
