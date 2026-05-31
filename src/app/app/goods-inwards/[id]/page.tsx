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

  const [{ data: receipt }, { data: suppliers }, { data: locations }, { data: rawPos }] =
    await Promise.all([
      supabase
        .from("delivery_receipt")
        .select(
          `id, supplier_id, supplier_name_override, supplier_reference, purchase_order_id,
           status, received_at, notes, stock_in_reason, created_at,
           supplier:supplier_id(name),
           location:location_id(id, name),
           delivery_receipt_line(
             id, component_id, quantity_delivered, quantity_expected, notes, cost_per_unit,
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
      supabase
        .from("purchase_order")
        .select(
          "id, supplier_id, suppliers(name), purchase_order_line(id, component_id, quantity, quantity_received)"
        )
        .in("status", ["open", "in_transit"])
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
    ]);

  if (!receipt) notFound();

  const receiptSupplierId = receipt.supplier_id as string | null;
  const availablePOs = (rawPos ?? [])
    .filter((po) => !receiptSupplierId || po.supplier_id === receiptSupplierId)
    .map((po) => {
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
    <ReceiptDetail
      receipt={receipt}
      suppliers={suppliers ?? []}
      locations={locations ?? []}
      availablePOs={availablePOs}
    />
  );
}
