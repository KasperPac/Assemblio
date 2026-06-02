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
      <ReceiptList receipts={receipts ?? []} />
    </section>
  );
}
