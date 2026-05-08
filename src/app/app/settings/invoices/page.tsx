import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import styles from "./invoices.module.css";

export default async function InvoicesPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { data: invoices } = await ctx.supabase
    .from("tenant_invoices")
    .select("id, period, amount_cents, currency, storage_path, created_at")
    .order("created_at", { ascending: false });

  const invoicesWithUrls = await Promise.all(
    (invoices ?? []).map(async (inv) => {
      const { data } = await ctx.supabase.storage
        .from("tenant-invoices")
        .createSignedUrl(inv.storage_path, 3600);
      return { ...inv, downloadUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Invoices"
        description="Monthly subscription invoices for your workspace."
      />

      {invoicesWithUrls.length === 0 ? (
        <p className={styles.empty}>
          Invoices will appear here once your first billing period ends.
        </p>
      ) : (
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>Period</th>
              <th className={styles.th}>Amount</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Download</th>
            </tr>
          </thead>
          <tbody>
            {invoicesWithUrls.map((inv) => (
              <tr key={inv.id} className={styles.tr}>
                <td className={styles.td}>{inv.period}</td>
                <td className={styles.td}>
                  {(inv.amount_cents / 100).toLocaleString("en-AU", {
                    style: "currency",
                    currency: inv.currency,
                  })}
                </td>
                <td className={styles.td}>
                  <span className={styles.paidBadge}>Paid</span>
                </td>
                <td className={styles.td}>
                  {inv.downloadUrl ? (
                    <a
                      href={inv.downloadUrl}
                      download
                      className={styles.downloadLink}
                    >
                      Download PDF
                    </a>
                  ) : (
                    <span className={styles.unavailable}>Unavailable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
