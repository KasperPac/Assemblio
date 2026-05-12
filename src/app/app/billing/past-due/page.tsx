import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import styles from "./past-due.module.css";

export const dynamic = "force-dynamic";

export default async function PastDuePage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");

  // We render this page regardless of access.state so users in the soft-warn
  // window who click the banner CTA still see it. The gate in the app shell
  // is what forces hard-locked tenants here.
  await getSubscriptionAccess(ctx.supabase, ctx.tenantId);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          !
        </div>
        <h1 className={styles.title}>Your payment didn&apos;t go through</h1>
        <p className={styles.subtitle}>
          We weren&apos;t able to charge your card on file. Update your payment
          method to keep your workspace active.
        </p>
        <form
          action="/api/billing/portal"
          method="POST"
          className={styles.actions}
        >
          <button type="submit" className={styles.primary}>
            Update payment method
          </button>
        </form>
        <p className={styles.footnote}>
          Already fixed? Stripe will notify us automatically — refresh in a
          moment.
        </p>
      </div>
    </main>
  );
}
