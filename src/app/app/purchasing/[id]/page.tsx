import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isReadOnlyRole } from "@/lib/tenant/authz";
import { isInvoiceableReceipt } from "@/lib/accounting/supplier-invoice/calc";
import { allLinesInvoiced } from "@/lib/accounting/supplier-invoice/invoiced";
import { chunk } from "@/lib/accounting/supplier-invoice/util";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import InvoiceStatusPanel, { type PanelInvoice } from "../invoices/invoice-status-panel";
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
    | { id: string; name: string; sku: string | null }
    | Array<{ id: string; name: string; sku: string | null }>
    | null;
};

type ReceiptRow = {
  id: string;
  supplier_reference: string;
  received_at: string;
  status: string;
};

function receiptStatusVariant(
  status: string
): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "po_linked") return "success";
  if (status === "discrepancy") return "warning";
  return "default";
}

function receiptStatusLabel(status: string): string {
  if (status === "po_linked") return "PO Linked";
  if (status === "discrepancy") return "Discrepancy";
  return "Unmatched";
}

export default async function PurchaseOrderDetailPage({ params }: Props) {
  const { id } = await params;

  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: po, error } = await supabase
    .from("purchase_order")
    .select(
      `id, po_number, status, created_at,
       supplier:supplier_id(id, name),
       purchase_order_line(id, quantity, quantity_received,
         component:component_id(id, name, sku))`
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !po) notFound();

  const { data: receipts } = await supabase
    .from("delivery_receipt")
    .select("id, supplier_reference, received_at, status")
    .eq("purchase_order_id", id)
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false });

  const receiptRows = (receipts ?? []) as ReceiptRow[];

  const { data: poInvoices, error: poInvoicesError } = await supabase
    .from("supplier_invoice")
    .select("id, invoice_number, status, sync_status")
    .eq("purchase_order_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (poInvoicesError) console.error("[supplier-invoice] PO detail: load invoices", poInvoicesError.message);

  // Is there anything left to invoice? Every line of every invoiceable receipt already on a live invoice means no.
  // A failed read keeps the action showing.
  let fullyInvoiced = false;
  {
    const supplierId = (Array.isArray(po.supplier) ? po.supplier[0] : po.supplier)?.id as string | undefined;
    const { data: recs, error: recsErr } = await supabase
      .from("delivery_receipt")
      .select("id, supplier_id, stock_in_reason, delivery_receipt_line(id)")
      .eq("purchase_order_id", id)
      .eq("tenant_id", tenantId);
    if (recsErr) console.error("[supplier-invoice] PO detail: load receipt lines", recsErr.message);
    else if (supplierId) {
      const lineIds = ((recs ?? []) as Array<{ supplier_id: string | null; stock_in_reason: string | null; delivery_receipt_line: Array<{ id: string }> | null }>)
        .filter((r) => isInvoiceableReceipt(r, supplierId))
        .flatMap((r) => (r.delivery_receipt_line ?? []).map((l) => l.id));
      const taken: Array<{ delivery_receipt_line_id: string; supplier_invoice: unknown }> = [];
      let failed = false;
      for (const ids of chunk(lineIds, 100)) {
        const { data, error: takenErr } = await supabase
          .from("supplier_invoice_line")
          .select("delivery_receipt_line_id, supplier_invoice:supplier_invoice_id(status)")
          .in("delivery_receipt_line_id", ids);
        if (takenErr) {
          console.error("[supplier-invoice] PO detail: load invoiced lines", takenErr.message);
          failed = true;
          break;
        }
        taken.push(...((data ?? []) as typeof taken));
      }
      fullyInvoiced = !failed && allLinesInvoiced(lineIds, taken);
    }
  }

  const rawSupplier = Array.isArray(po.supplier) ? po.supplier[0] : po.supplier;
  const supplier = rawSupplier as { id: string; name: string } | null;
  const supplierName = supplier?.name ?? "Unknown supplier";
  const canReceive = po.status === "open" || po.status === "in_transit";
  // Not for read-only roles, and not for a PO that is still a draft or has been cancelled.
  const canInvoice = !!supplier?.id && !fullyInvoiced && !isReadOnlyRole(ctx.role) && po.status !== "draft" && po.status !== "cancelled";
  const lines = (po.purchase_order_line ?? []) as POLine[];
  const poLabel = (po.po_number as string | null) ?? `PO-${id.slice(0, 8).toUpperCase()}`;

  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[
          { label: "Purchase Orders", href: "/app/purchasing" },
          { label: poLabel },
        ]}
        title={poLabel}
        actions={
          canInvoice || canReceive ? (
            <div className={styles.headerActions}>
              {canInvoice ? (
                <Link
                  href={`/app/purchasing/invoices/new?po=${id}`}
                  className={styles.secondaryBtn}
                >
                  Enter supplier invoice
                </Link>
              ) : null}
              {canReceive ? (
                <Link
                  href={`/app/goods-inwards/new?po=${id}`}
                  className={styles.primary}
                >
                  Receive Goods →
                </Link>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <InvoiceStatusPanel
        invoices={(poInvoices ?? []) as PanelInvoice[]}
        loadError={!!poInvoicesError}
      />

      {/* Info card */}
      <div className={styles.formCard}>
        <div className={styles.infoRow}>
          <div className={styles.infoField}>
            <p className={styles.meta}>Supplier</p>
            {supplier?.id ? (
              <Link
                href={`/app/suppliers/${supplier.id}`}
                className={styles.link}
              >
                {supplierName}
              </Link>
            ) : (
              <strong>{supplierName}</strong>
            )}
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
                    <td>
                      {comp?.id ? (
                        <Link
                          href={`/app/components/${comp.id}`}
                          className={styles.link}
                        >
                          {compName}
                        </Link>
                      ) : (
                        compName
                      )}
                    </td>
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

      {/* Receipts card */}
      <div className={styles.formCard}>
        <h2>Receipts</h2>
        {receiptRows.length === 0 ? (
          <p className={styles.meta}>No deliveries recorded against this PO yet.</p>
        ) : (
          <table className={styles.linesTable}>
            <thead>
              <tr>
                <th>Docket</th>
                <th>Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {receiptRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/app/goods-inwards/${r.id}`} className={styles.link}>
                      {r.supplier_reference}
                    </Link>
                  </td>
                  <td className={styles.meta}>
                    {new Date(r.received_at).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    <StatusBadge variant={receiptStatusVariant(r.status)}>
                      {receiptStatusLabel(r.status)}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
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
