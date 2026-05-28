import Link from "next/link";
import styles from "./super-admin.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import NewTenantModal from "./_components/new-tenant-modal";

type StatusFilter = "all" | "trialing" | "active" | "past_due" | "suspended" | "deleted";

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  suspended: "Suspended",
  deleted: "Deleted",
};

function parseFilter(value: string | undefined): StatusFilter {
  if (
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "suspended" ||
    value === "deleted" ||
    value === "all"
  ) return value;
  return "all";
}

export default async function SuperAdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; new?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const search = (params.q ?? "").trim();

  const ctx = await getServerTenantContext();
  const supabase = ctx!.supabase;
  const canMutate = ctx?.role === "super_admin";

  const [{ data: tenants }, { data: subs }, { data: members }] = await Promise.all([
    supabase
      .from("tenant")
      .select("id, name, created_at, suspended_at, deleted_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_subscription")
      .select("tenant_id, selected_tier, status, trial_ends_at"),
    supabase
      .from("profile_tenant_access")
      .select("tenant_id"),
  ]);

  const subByTenant = new Map((subs ?? []).map((s) => [s.tenant_id, s]));
  const memberCountByTenant = new Map<string, number>();
  for (const row of members ?? []) {
    memberCountByTenant.set(row.tenant_id, (memberCountByTenant.get(row.tenant_id) ?? 0) + 1);
  }

  const allRows = (tenants ?? []).map((t) => {
    const sub = subByTenant.get(t.id);
    const derivedStatus: StatusFilter = t.deleted_at
      ? "deleted"
      : t.suspended_at
      ? "suspended"
      : ((sub?.status as StatusFilter) ?? "all");
    return {
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      tier: sub?.selected_tier ?? "—",
      trial_ends_at: sub?.trial_ends_at ?? null,
      members: memberCountByTenant.get(t.id) ?? 0,
      derivedStatus,
    };
  });

  const filtered = allRows.filter((r) => {
    if (filter !== "all" && r.derivedStatus !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const countsByStatus = new Map<StatusFilter, number>();
  for (const r of allRows) {
    countsByStatus.set(r.derivedStatus, (countsByStatus.get(r.derivedStatus) ?? 0) + 1);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tenants"
        description={`${filtered.length} of ${allRows.length} tenants on the platform.`}
        actions={
          canMutate ? (
            <Link href="/app/super-admin?new=1" className={styles.newButton}>
              + New tenant
            </Link>
          ) : (
            <button disabled title="Observers cannot make changes" className={styles.newButton}>
              + New tenant
            </button>
          )
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((key) => {
            const href = `/app/super-admin${key === "all" ? "" : `?status=${key}`}`;
            const active = key === filter;
            const count = key === "all" ? allRows.length : countsByStatus.get(key) ?? 0;
            return (
              <a key={key} href={href} className={active ? styles.tabActive : styles.tab}>
                {FILTER_LABELS[key]}
                <span className={styles.tabCount}>{count}</span>
              </a>
            );
          })}
        </div>
        <form className={styles.search} method="get">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by tenant name"
            aria-label="Search by tenant name"
          />
        </form>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No tenants match.</p>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Trial ends</th>
                <th>Members</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/app/super-admin/tenants/${r.id}`} className={styles.nameCell}>
                      {r.name}
                    </Link>
                  </td>
                  <td>
                    <span className={`${styles.statusPill} ${styles[`status_${r.derivedStatus}`]}`}>
                      {FILTER_LABELS[r.derivedStatus] ?? r.derivedStatus}
                    </span>
                  </td>
                  <td>{r.tier}</td>
                  <td className={styles.meta}>
                    {r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"}
                  </td>
                  <td>{r.members}</td>
                  <td className={styles.meta}>{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canMutate && params.new === "1" && (
        <NewTenantModal defaultTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone} />
      )}
    </div>
  );
}
