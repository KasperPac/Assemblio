import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { invoiceBadge, jobBadge, OPERATION_LABELS } from "@/lib/accounting/supplier-invoice/labels";
import { isFailedForGood } from "@/lib/accounting/outbox/state";
import PageHeader from "../../../_ui/page-header";
import StatusBadge from "../../../_ui/status-badge";
import EmptyState from "../../../_ui/empty-state";
import InvoiceActions from "../invoice-actions";
import styles from "../invoices.module.css";

type Props = { params: Promise<{ id: string }> };
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SupplierInvoicePage({ params }: Props) {
  const { id } = await params;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (!ctx.tenantId) redirect("/app");
  if (!UUID.test(id)) notFound();
  const { supabase, tenantId } = ctx;

  const loadFailed = (what: string, error: { message?: string }) => {
    console.error(`[supplier-invoice] detail page: ${what}`, error.message);
    return (
      <section className={styles.page}>
        <PageHeader eyebrow="Operations" breadcrumbs={[{ label: "Supplier invoices", href: "/app/purchasing/invoices" }, { label: "Invoice" }]} title="Supplier invoice" />
        <EmptyState title="Couldn't load this invoice" message={`We couldn't load ${what}. Refresh to try again.`} />
      </section>
    );
  };

  const { data, error } = await supabase
    .from("supplier_invoice")
    .select("id, invoice_number, invoice_date, due_date, amounts_mode, currency, subtotal, tax_total, total, entered_total, status, sync_status, external_url, posted_at, voided_at, void_reason, purchase_order_id, supplier:supplier_id(name), purchase_order:purchase_order_id(po_number), supplier_invoice_line(line_no, kind, description, quantity, unit_amount, tax_type, tax_rate, account_code, line_amount, tax_amount, qty_variance, price_variance)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return loadFailed("the invoice", error);
  if (!data) notFound();
  const inv = data as unknown as Record<string, unknown> & {
    invoice_number: string; status: string; sync_status: string; currency: string; external_url: string | null;
    supplier_invoice_line: Array<Record<string, unknown> & { line_no: number }>;
  };
  if (inv.status === "draft") redirect(`/app/purchasing/invoices/new?draft=${id}`);

  const { data: jobs, error: jobsErr } = await supabase
    .from("accounting_outbox")
    .select("id, operation, status, error_class, error_message, created_at")
    .eq("tenant_id", tenantId)
    .eq("entity_type", "supplier_invoice")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(5);
  if (jobsErr) return loadFailed("its Xero sync status", jobsErr);
  const latest = ((jobs ?? []) as Array<{ id: string; operation: string; status: string; error_class: string | null; error_message: string | null }>)[0];
  const admin = isAdminRole(ctx.role);
  const money = (n: unknown) => new Intl.NumberFormat("en-AU", { style: "currency", currency: inv.currency }).format(Number(n ?? 0));
  const unitMoney = (n: unknown) => new Intl.NumberFormat("en-AU", { style: "currency", currency: inv.currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n ?? 0));
  const badge = invoiceBadge(inv.status, inv.sync_status);
  const supplierName = one(inv.supplier as { name: string | null } | null)?.name ?? "Supplier";
  const poNumber = one(inv.purchase_order as { po_number: string | null } | null)?.po_number;
  const lines = [...inv.supplier_invoice_line].sort((a, b) => a.line_no - b.line_no);
  const latestBadge = latest ? jobBadge(latest.status, latest.error_class) : null;

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Operations"
        breadcrumbs={[{ label: "Supplier invoices", href: "/app/purchasing/invoices" }, { label: inv.invoice_number }]}
        title={`${supplierName} · ${inv.invoice_number}`}
        actions={
          <div className={styles.actions}>
            {inv.external_url ? <a href={inv.external_url} target="_blank" rel="noreferrer" className={styles.secondaryBtn}>View in Xero ↗</a> : null}
            <InvoiceActions
              invoiceId={id}
              canVoid={admin && inv.status === "posted"}
              retryJobId={admin && latest && isFailedForGood(latest) ? latest.id : null}
            />
          </div>
        }
      />
      <div className={styles.formCard}>
        <div className={styles.fields}>
          <div className={styles.field}><span className={styles.caps}>Status</span><StatusBadge variant={badge.variant}>{badge.label}</StatusBadge></div>
          <div className={styles.field}><span className={styles.caps}>Purchase order</span>{poNumber && inv.purchase_order_id ? <Link className={styles.link} href={`/app/purchasing/${inv.purchase_order_id as string}`}>{poNumber}</Link> : <span>—</span>}</div>
          <div className={styles.field}><span className={styles.caps}>Invoice date</span><span>{String(inv.invoice_date)}</span></div>
          <div className={styles.field}><span className={styles.caps}>Due date</span><span>{String(inv.due_date)}</span></div>
          <div className={styles.field}><span className={styles.caps}>Amounts</span><span>{inv.amounts_mode === "inclusive" ? "Including GST" : "Excluding GST"}</span></div>
          <div className={styles.field}><span className={styles.caps}>Total</span><span>{money(inv.total)}</span></div>
        </div>
        {inv.void_reason ? <p className={styles.help}>Voided: {String(inv.void_reason)}</p> : null}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr><th>Description</th><th className={styles.num}>Qty</th><th className={styles.num}>Unit price</th><th>Tax</th><th>Account</th><th className={styles.num}>Amount</th><th className={styles.num}>Qty vs received</th><th className={styles.num}>Price vs PO</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line_no}>
                <td>{String(l.description)}</td>
                <td className={styles.num}>{Number(l.quantity)}</td>
                <td className={styles.num}>{unitMoney(l.unit_amount)}</td>
                <td>{(l.tax_type as string | null) ?? `${Number(l.tax_rate)}%`}</td>
                <td>{(l.account_code as string | null) ?? "—"}</td>
                <td className={styles.num}>{money(l.line_amount)}</td>
                <td className={`${styles.num} ${Number(l.qty_variance ?? 0) !== 0 ? styles.variance : ""}`}>{l.qty_variance === null ? "" : Number(l.qty_variance) === 0 ? "—" : Number(l.qty_variance)}</td>
                <td className={`${styles.num} ${Number(l.price_variance ?? 0) !== 0 ? styles.variance : ""}`}>{l.price_variance === null ? "" : Number(l.price_variance) === 0 ? "—" : unitMoney(l.price_variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {latest && latestBadge ? (
        <div className={styles.formCard}>
          <span className={styles.caps}>Xero</span>
          <div className={styles.receiptRow}>
            <span>{OPERATION_LABELS[latest.operation] ?? latest.operation}</span>
            <StatusBadge variant={latestBadge.variant}>{latestBadge.label}</StatusBadge>
            {latest.error_message ? <span className={styles.help}>{latest.error_message}</span> : null}
          </div>
        </div>
      ) : null}

      <Link href="/app/purchasing/invoices" className={styles.backLink}>← Back to supplier invoices</Link>
    </section>
  );
}
