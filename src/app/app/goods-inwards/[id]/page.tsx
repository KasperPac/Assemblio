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

  const { data: receipt } = await supabase
    .from("delivery_receipt")
    .select(
      `id, supplier_name_override, supplier_reference, purchase_order_id,
       status, received_at, notes, stock_in_reason, created_at,
       supplier:supplier_id(name),
       location:location_id(name),
       delivery_receipt_line(
         id, component_id, quantity_delivered, quantity_expected, notes,
         component:component_id(name, sku)
       )`
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) notFound();

  const openPOs =
    receipt.status === "unmatched"
      ? (
          await supabase
            .from("purchase_order")
            .select("id, supplier_id, suppliers:supplier_id(name)")
            .eq("tenant_id", tenantId)
            .eq("status", "open")
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  return <ReceiptDetail receipt={receipt} openPOs={openPOs} />;
}
