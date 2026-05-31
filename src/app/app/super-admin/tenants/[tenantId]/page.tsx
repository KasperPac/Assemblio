import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import styles from "./tenant-detail.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import LifecycleControls from "./_components/lifecycle-controls";
import MembersPanel from "./_components/members-panel";
import VitalsPanel from "./_components/vitals-panel";
import type { TenantVitals } from "./_components/vitals-panel";
import { viewAsTenant } from "../../actions";
import PageHeader from "../../../_ui/page-header";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app");
  const { supabase } = ctx;
  const canMutate = ctx.role === "super_admin";

  const [
    { data: tenant },
    { data: sub },
    { data: members },
    { data: audit },
    { data: vitalsRows, error: vitalsError },
  ] = await Promise.all([
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_tenant_vitals", { p_tenant_id: tenantId }),
  ]);

  if (!tenant) notFound();

  const memberIds = (members ?? []).map((m) => m.profile_id);
  const auditActorIds = Array.from(new Set((audit ?? []).map((r) => r.actor_id)));
  const allIds = Array.from(new Set([...memberIds, ...auditActorIds]));

  let emailById = new Map<string, string | null>();
  if (allIds.length > 0) {
    const { data: emailRows } = await supabase.rpc("get_user_emails", { p_ids: allIds });
    emailById = new Map(((emailRows ?? []) as Array<{ id: string; email: string | null }>).map((r) => [r.id, r.email]));
  }

  const memberRows = (members ?? []).map((m) => ({
    profile_id: m.profile_id,
    role: m.role,
    email: emailById.get(m.profile_id) ?? null,
  }));

  // vitalsRows is an array with one element (single-row return from the RPC)
  if (vitalsError) console.error("[vitals RPC error]", vitalsError);
  const rawVitals = (vitalsRows as unknown[] | null)?.[0] as Record<string, unknown> | undefined;
  const vitals: TenantVitals | null = rawVitals
    ? {
        last_activity_at: (rawVitals.last_activity_at as string | null) ?? null,
        seven_day_event_count: (rawVitals.seven_day_event_count as number) ?? 0,
        seven_day_active_members: (rawVitals.seven_day_active_members as number) ?? 0,
        member_last_sign_in_at: (rawVitals.member_last_sign_in_at as string | null) ?? null,
        member_count: memberRows.length,
        component_count: (rawVitals.component_count as number) ?? 0,
        bom_count: (rawVitals.bom_count as number) ?? 0,
        open_order_count: (rawVitals.open_order_count as number) ?? 0,
        supplier_count: (rawVitals.supplier_count as number) ?? 0,
        shopify_connected: (rawVitals.shopify_connected as boolean) ?? false,
        shopify_store_domain: (rawVitals.shopify_store_domain as string | null) ?? null,
        shopify_last_synced_at: (rawVitals.shopify_last_synced_at as string | null) ?? null,
        shopify_last_sync_status: (rawVitals.shopify_last_sync_status as string | null) ?? null,
        shopify_last_sync_error: (rawVitals.shopify_last_sync_error as string | null) ?? null,
        accounting_provider: (rawVitals.accounting_provider as string | null) ?? null,
        accounting_account_name: (rawVitals.accounting_account_name as string | null) ?? null,
        accounting_token_expires_at: (rawVitals.accounting_token_expires_at as string | null) ?? null,
        accounting_token_expired: (rawVitals.accounting_token_expired as boolean | null) ?? null,
        accounting_thirty_day_synced: (rawVitals.accounting_thirty_day_synced as number) ?? 0,
        accounting_thirty_day_failed: (rawVitals.accounting_thirty_day_failed as number) ?? 0,
      }
    : null;

  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[
          { label: "Tenants", href: "/app/super-admin" },
          { label: tenant.name },
        ]}
        title={tenant.name}
        description={`Created ${new Date(tenant.created_at).toLocaleDateString()} · ${tenant.timezone} · ${tenant.currency}`}
        actions={
          <div className={styles.headerActions}>
            <form action={async () => { "use server"; await viewAsTenant(tenant.id); }}>
              <button type="submit" className={styles.viewAsButton}>View as</button>
            </form>
            <LifecycleControls
              tenantId={tenant.id}
              tenantName={tenant.name}
              isSuspended={!!tenant.suspended_at}
              isDeleted={!!tenant.deleted_at}
              currentTier={sub?.selected_tier ?? null}
              currentStatus={sub?.status ?? null}
              currentTrialEndsAt={sub?.trial_ends_at ?? null}
              canMutate={canMutate}
            />
          </div>
        }
      />

      <div className={styles.pills}>
        {tenant.deleted_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Deleted</span>}
        {tenant.suspended_at && <span className={`${styles.pill} ${styles.pillDanger}`}>Suspended</span>}
        {sub?.status && (
          <span className={`${styles.pill} ${styles[`status_${sub.status}`]}`}>{sub.status}</span>
        )}
      </div>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Subscription</h2>
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

      <section className={styles.card}>
        <MembersPanel tenantId={tenant.id} members={memberRows} canMutate={canMutate} />
      </section>

      {vitalsError && (
        <section className={styles.card}>
          <p style={{ color: "var(--danger)", fontFamily: "monospace", fontSize: "0.82rem" }}>
            Vitals RPC error: {vitalsError.message} (code: {vitalsError.code})
          </p>
        </section>
      )}
      {vitals && (
        <section className={styles.card}>
          <VitalsPanel vitals={vitals} />
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Recent audit</h2>
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Metadata</th></tr></thead>
            <tbody>
              {(audit ?? []).map((row) => (
                <tr key={row.id}>
                  <td className={styles.meta}>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.action}</td>
                  <td className={styles.meta}>{emailById.get(row.actor_id) ?? row.actor_id.slice(0, 8) + "…"}</td>
                  <td><code className={styles.code}>{JSON.stringify(row.metadata)}</code></td>
                </tr>
              ))}
              {(audit ?? []).length === 0 && (
                <tr><td colSpan={4} className={styles.empty}>No audit entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
