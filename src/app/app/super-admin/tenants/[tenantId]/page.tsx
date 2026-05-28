import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./tenant-detail.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import LifecycleControls from "./_components/lifecycle-controls";
import MembersPanel from "./_components/members-panel";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: tenant }, { data: sub }, { data: members }, { data: audit }] = await Promise.all([
    supabase
      .from("tenant")
      .select("id, name, timezone, currency, created_at, suspended_at, suspended_reason, deleted_at")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("tenant_subscription")
      .select("selected_tier, status, billing_interval, trial_started_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, current_period_end, manual_override_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("profile_tenant_access")
      .select("profile_id, role")
      .eq("tenant_id", tenantId),
    supabase
      .from("super_admin_audit_log")
      .select("id, actor_id, action, metadata, created_at")
      .eq("target_tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const memberIds = (members ?? []).map((m) => m.profile_id);
  let memberEmails: Record<string, string | null> = {};
  if (memberIds.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: usersResp } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const byId = new Map((usersResp?.users ?? []).map((u) => [u.id, u.email ?? null]));
    memberEmails = Object.fromEntries(memberIds.map((id) => [id, byId.get(id) ?? null]));
  }

  const memberRows = (members ?? []).map((m) => ({
    profile_id: m.profile_id,
    role: m.role,
    email: memberEmails[m.profile_id] ?? null,
  }));

  if (!tenant) notFound();

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link href="/app/super-admin">Tenants</Link> <span>/</span> <span>{tenant.name}</span>
      </div>

      <section className={styles.headerCard}>
        <h1 className={styles.title}>{tenant.name}</h1>
        <div className={styles.pills}>
          {tenant.deleted_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Deleted</span>}
          {tenant.suspended_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Suspended</span>}
          {sub?.status && <span className={`${styles.pill} ${styles[`status_${sub.status}`]}`}>{sub.status}</span>}
        </div>
        <p className={styles.meta}>
          Created {new Date(tenant.created_at).toLocaleDateString()} · {tenant.timezone} · {tenant.currency}
        </p>
        <LifecycleControls
          tenantId={tenant.id}
          tenantName={tenant.name}
          isSuspended={!!tenant.suspended_at}
          isDeleted={!!tenant.deleted_at}
          currentTier={sub?.selected_tier ?? null}
          currentStatus={sub?.status ?? null}
          currentTrialEndsAt={sub?.trial_ends_at ?? null}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Subscription</h2>
        <dl className={styles.dl}>
          <div><dt>Tier</dt><dd>{sub?.selected_tier ?? "—"}</dd></div>
          <div><dt>Status</dt><dd>{sub?.status ?? "—"}</dd></div>
          <div><dt>Billing interval</dt><dd>{sub?.billing_interval ?? "—"}</dd></div>
          <div><dt>Trial started</dt><dd>{sub?.trial_started_at ? new Date(sub.trial_started_at).toLocaleString() : "—"}</dd></div>
          <div><dt>Trial ends</dt><dd>{sub?.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleString() : "—"}</dd></div>
          <div><dt>Manual override</dt><dd>{sub?.manual_override_at ? new Date(sub.manual_override_at).toLocaleString() : "—"}</dd></div>
          <div><dt>Stripe customer</dt><dd>{sub?.stripe_customer_id ?? "—"}</dd></div>
          <div><dt>Stripe subscription</dt><dd>{sub?.stripe_subscription_id ?? "—"}</dd></div>
        </dl>
      </section>

      <section className={styles.section}>
        <MembersPanel tenantId={tenant.id} members={memberRows} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent audit</h2>
        <table className={styles.auditTable}>
          <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Metadata</th></tr></thead>
          <tbody>
            {(audit ?? []).map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.created_at).toLocaleString()}</td>
                <td>{row.action}</td>
                <td>{row.actor_id.slice(0, 8)}…</td>
                <td><code className={styles.code}>{JSON.stringify(row.metadata)}</code></td>
              </tr>
            ))}
            {(audit ?? []).length === 0 && <tr><td colSpan={4} className={styles.empty}>No audit entries.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
