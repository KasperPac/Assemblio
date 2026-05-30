import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import PaywallCards from "./paywall-cards";
import styles from "./paywall.module.css";

export const dynamic = "force-dynamic";

export default async function PaywallPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");
  const tenantId = ctx.tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  const access = await getSubscriptionAccess(ctx.supabase, tenantId);
  const sub = access.sub;
  const selectedTier = sub?.selected_tier ?? "growth";
  const initialBilling = sub?.billing_interval ?? "annual";

  let heading: string;
  let subheading: string;
  if (!sub) {
    heading = "Pick a plan to get started";
    subheading = "Choose a plan to activate your workspace.";
  } else if (sub.status === "canceled") {
    heading = "Your subscription is canceled";
    subheading = "Pick a plan to reactivate your workspace.";
  } else if (sub.status === "trialing") {
    heading = "Upgrade your workspace";
    subheading = "Lock in your plan any time before your free trial ends.";
  } else {
    heading = "Your free trial has ended";
    subheading = "Pick a plan to keep using Manuva.";
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{heading}</h1>
        <p className={styles.subtitle}>{subheading}</p>
      </header>
      <PaywallCards initialTier={selectedTier} initialBilling={initialBilling} />
      <p className={styles.footnote}>
        Need something custom?{" "}
        <a href="/contact" className={styles.footnoteLink}>
          Talk to sales →
        </a>
      </p>
    </main>
  );
}
