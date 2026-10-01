import Link from "next/link";
import StatusBadge from "../../_ui/status-badge";
import { invoiceBadge } from "@/lib/accounting/supplier-invoice/labels";
import styles from "./invoices.module.css";

export type PanelInvoice = { id: string; invoice_number: string; status: string; sync_status: string };

/** Invoiced / Not invoiced badge and links to the live invoices. The "Enter supplier invoice" action lives in the page's PageHeader. */
export default function InvoiceStatusPanel({ invoices, loadError = false }: { invoices: PanelInvoice[]; loadError?: boolean }) {
  if (loadError) {
    return (
      <div className={styles.statusPanel}>
        <span className={styles.caps}>Supplier invoice</span>
        <p className={styles.error}>Couldn&apos;t load supplier invoice status. Refresh to try again.</p>
      </div>
    );
  }
  const live = invoices.filter((i) => i.status !== "voided");
  const posted = live.some((i) => i.status === "posted");
  return (
    <div className={styles.statusPanel}>
      <span className={styles.caps}>Supplier invoice</span>
      {posted ? <StatusBadge variant="success">Invoiced</StatusBadge> : <StatusBadge variant="warning">Not invoiced</StatusBadge>}
      {live.map((i) => {
        const b = invoiceBadge(i.status, i.sync_status);
        return (
          <Link key={i.id} href={`/app/purchasing/invoices/${i.id}`} className={styles.panelLink}>
            {i.invoice_number} <StatusBadge variant={b.variant}>{b.label}</StatusBadge>
          </Link>
        );
      })}
    </div>
  );
}
