import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import { getStatusVariant } from "../status-utils";
import styles from "../purchasing.module.css";

type Props = {
  params: Promise<{ id: string }>;
};

type POLine = {
  id: string;
  quantity: number;
  quantity_received: number;
  component:
    | { name: string; sku: string | null }
    | Array<{ name: string; sku: string | null }>
    | null;
};

export default async function PurchaseOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: po, error } = await supabase
    .from("purchase_order")
    .select(
      `id, status, created_at,
       suppliers(name),
       purchase_order_line(id, quantity, quantity_received,
         component:component_id(name, sku))`
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !po) notFound();

  const rawSupplier = Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers;
  const supplierName =
    (rawSupplier as { name: string } | null)?.name ?? "Unknown supplier";
  const canReceive = po.status === "open" || po.status === "in_transit";
  const lines = (po.purchase_order_line ?? []) as POLine[];

  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[
          { label: "Purchase Orders", href: "/app/purchasing" },
          { label: `PO-${id.slice(0, 8).toUpperCase()}` },
        ]}
        title={`PO-${id.slice(0, 8).toUpperCase()}`}
        actions={
          canReceive ? (
            <Link
              href={`/app/goods-inwards/new?po=${id}`}
              className={styles.primary}
            >
              Receive Goods →
            </Link>
          ) : undefined
        }
      />

      {/* Info card */}
      <div className={styles.formCard}>
        <div className={styles.infoRow}>
          <div className={styles.infoField}>
            <p className={styles.meta}>Supplier</p>
            <strong>{supplierName}</strong>
          </div>
          <div className={styles.infoField}>
            <p className={styles.meta}>Status</p>
            <StatusBadge variant={getStatusVariant(po.status as string)}>
              {(po.status as string).replace(/_/g, " ")}
            </StatusBadge>
          </div>
          <div className={styles.infoField}>
            <p className={styles.meta}>Created</p>
            <span>
              {new Date(po.created_at as string).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Lines card */}
      <div className={styles.formCard}>
        <h2>Lines</h2>
        {lines.length === 0 ? (
          <p className={styles.meta}>No lines on this PO.</p>
        ) : (
          <table className={styles.linesTable}>
            <thead>
              <tr>
                <th>Component</th>
                <th className={styles.alignRight}>Ordered</th>
                <th className={styles.alignRight}>Received</th>
                <th className={styles.alignRight}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const comp = Array.isArray(line.component)
                  ? line.component[0]
                  : line.component;
                const compName = comp
                  ? comp.sku
                    ? `${comp.name} (${comp.sku})`
                    : comp.name
                  : "Unknown component";
                const outstanding = line.quantity - line.quantity_received;
                const fullyReceived = outstanding <= 0;
                return (
                  <tr
                    key={line.id}
                    style={{ opacity: fullyReceived ? 0.45 : 1 }}
                  >
                    <td>{compName}</td>
                    <td className={`${styles.alignRight} ${styles.meta}`}>
                      {line.quantity}
                    </td>
                    <td className={`${styles.alignRight} ${styles.meta}`}>
                      {line.quantity_received}
                    </td>
                    <td className={styles.alignRight}>
                      {fullyReceived ? (
                        <span className={styles.faint}>—</span>
                      ) : (
                        outstanding
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <Link href="/app/purchasing" className={styles.backLink}>
          ← Back to purchase orders
        </Link>
      </div>
    </div>
  );
}
