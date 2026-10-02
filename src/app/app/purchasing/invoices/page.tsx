import { redirect } from "next/navigation";
import Link from "next/link";
import { one } from "@/lib/accounting/supplier-invoice/util";
import { getServerTenantContext } from "@/lib/tenant/context";
import { INVOICE_TABS, invoiceBadge } from "@/lib/accounting/supplier-invoice/labels";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";
import { poLabel } from "@/lib/purchasing/po-label";
import styles from "./invoices.module.css";

type Props = { searchParams?: Promise<{ tab?: string }> };

export default async function SupplierInvoicesPage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");
  if (!ctx.tenantId) redirect("/app");
  const requested = (await searchParams)?.tab;
  const tab = INVOICE_TABS.find((t) => t.key === requested)?.key ?? "all";

  let q = ctx.supabase
    .from("supplier_invoice")
    .select("id, invoice_number, invoice_date, due_date, total, currency, status, sync_status, external_url, purchase_order_id, supplier:supplier_id(name), purchase_order:purchase_order_id(id, po_number)")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (tab === "draft" || tab === "voided") q = q.eq("status", tab);
  // A failed or queued sync can belong to a voided invoice too (a failed void leaves a live bill in Xero).
  else if (tab === "failed" || tab === "queued") q = q.in("status", ["posted", "voided"]).eq("sync_status", tab);
  else if (tab !== "all") q = q.eq("status", "posted").eq("sync_status", tab);
  const { data, error } = await q;
  if (error) console.error("[supplier-invoice] list page", error.message);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string; status: string; sync_status: string; currency: string; external_url: string | null; purchase_order_id: string | null }>;

  return (
    <section className={styles.page}>
      <PageHeader eyebrow="Operations" title="Supplier invoices" description="Supplier tax invoices recorded against goods receipts, and their bills in Xero." />
      <nav className={styles.tabs} aria-label="Filter invoices">
        {INVOICE_TABS.map((t) => (
          <Link key={t.key} href={t.key === "all" ? "/app/purchasing/invoices" : `/app/purchasing/invoices?tab=${t.key}`} className={t.key === tab ? styles.tabActive : styles.tab}>{t.label}</Link>
        ))}
      </nav>
      {error ? (
        <EmptyState title="Couldn't load supplier invoices" message="The invoice list could not be retrieved. Refresh to try again." />
      ) : rows.length === 0 ? (
        <EmptyState title="No supplier invoices here" message="Open a purchase order or a supplier delivery and choose “Enter supplier invoice”." />
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr><th>Invoice</th><th>Supplier</th><th>PO</th><th>Invoice date</th><th>Due</th><th className={styles.num}>Total</th><th>Status</th><th>Xero</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = invoiceBadge(r.status, r.sync_status);
                return (
                  <tr key={r.id}>
                    <td><Link className={styles.link} href={`/app/purchasing/invoices/${r.id}`}>{String(r.invoice_number)}</Link></td>
                    <td>{one(r.supplier as { name: string | null } | null)?.name ?? "—"}</td>
                    <td>{(() => {
                      const po = one(r.purchase_order as { id: string; po_number: string | null } | null);
                      return po ? <Link className={styles.link} href={`/app/purchasing/${po.id}`}>{poLabel(po)}</Link> : "—";
                    })()}</td>
                    <td>{String(r.invoice_date)}</td>
                    <td>{String(r.due_date)}</td>
                    <td className={styles.num}>{new Intl.NumberFormat("en-AU", { style: "currency", currency: r.currency }).format(Number(r.total))}</td>
                    <td><StatusBadge variant={b.variant}>{b.label}</StatusBadge></td>
                    <td>{r.external_url ? <a className={styles.link} href={r.external_url} target="_blank" rel="noreferrer">Xero ↗</a> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
