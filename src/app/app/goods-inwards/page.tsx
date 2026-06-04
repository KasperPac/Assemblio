import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptList from "./receipt-list";
import PageHeader from "../_ui/page-header";
import styles from "./goods-inwards.module.css";
import Link from "next/link";

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

  const { data: duePOsRaw } = await supabase
    .from("purchase_order")
    .select(
      "id, expected_date, supplier:supplier_id(name), purchase_order_line(id), delivery_receipt(id)"
    )
    .in("status", ["open", "in_transit"])
    .not("expected_date", "is", null)
    .eq("tenant_id", tenantId)
    .order("expected_date", { ascending: true });

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + 14);

  const duePOs = (duePOsRaw ?? [])
    .filter((po) => {
      // Exclude POs that already have a receipt
      const receipts = po.delivery_receipt ?? [];
      if (Array.isArray(receipts) ? receipts.length > 0 : !!receipts) return false;
      // Include overdue and due within 14 days, with 90-day lower bound
      const expected = new Date(po.expected_date as string);
      const lowerBound = new Date(now);
      lowerBound.setDate(lowerBound.getDate() - 90);
      return expected >= lowerBound && expected <= cutoff;
    })
    .map((po) => {
      const rawSupplier = Array.isArray(po.supplier) ? po.supplier[0] : po.supplier;
      const lines = po.purchase_order_line ?? [];
      return {
        id: po.id as string,
        expected_date: po.expected_date as string,
        supplier_name:
          (rawSupplier as { name: string } | null)?.name ?? "Unknown supplier",
        line_count: Array.isArray(lines) ? lines.length : 0,
      };
    });

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Operations"
        title="Goods Inwards"
        description="Receive and reconcile supplier deliveries against purchase orders."
        actions={
          <Link href="/app/goods-inwards/new" className={styles.primary}>
            New Receipt
          </Link>
        }
      />
      <ReceiptList receipts={receipts ?? []} duePOs={duePOs} />
    </section>
  );
}
