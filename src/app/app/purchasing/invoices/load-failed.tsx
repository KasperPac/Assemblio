import PageHeader from "../../_ui/page-header";
import EmptyState from "../../_ui/empty-state";
import styles from "./invoices.module.css";

/** Error state for the invoice pages. Logs the real error server-side and tells the user to refresh. */
export default function LoadFailed({ title, crumb, what, error }: { title: string; crumb: string; what: string; error: { message?: string } }) {
  console.error(`[supplier-invoice] ${title}: couldn't load ${what}`, error.message);
  return (
    <section className={styles.page}>
      <PageHeader eyebrow="Operations" breadcrumbs={[{ label: "Supplier invoices", href: "/app/purchasing/invoices" }, { label: crumb }]} title={title} />
      <EmptyState title="Couldn't load this page" message={`We couldn't load ${what}. Refresh to try again.`} />
    </section>
  );
}
