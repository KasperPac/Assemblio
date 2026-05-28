import Link from "next/link";
import styles from "./super-admin.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const search = (params.q ?? "").trim();

  const supabase = await createSupabaseServerClient();

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

  const rows = (tenants ?? [])
    .map((t) => {
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
    })
    .filter((r) => {
      if (filter !== "all" && r.derivedStatus !== filter) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Tenants</h1>
        <Link className={styles.newButton} href="/app/super-admin?new=1">+ New tenant</Link>
      </div>

      <div className={styles.filterRow}>
        {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((key) => {
          const href = `/app/super-admin${key === "all" ? "" : `?status=${key}`}`;
          const active = key === filter;
          return (
            <Link key={key} href={href} className={`${styles.filterPill} ${active ? styles.active : ""}`}>
              {FILTER_LABELS[key]}
            </Link>
          );
        })}
        <form className={styles.searchForm}>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search tenant name…"
            className={styles.searchInput}
          />
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
        </form>
      </div>

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
          {rows.map((r) => (
            <tr key={r.id} className={styles.row}>
              <td>
                <Link href={`/app/super-admin/tenants/${r.id}`} className={styles.rowLink}>
                  {r.name}
                </Link>
              </td>
              <td><span className={`${styles.statusPill} ${styles[`status_${r.derivedStatus}`]}`}>{FILTER_LABELS[r.derivedStatus] ?? r.derivedStatus}</span></td>
              <td>{r.tier}</td>
              <td>{r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"}</td>
              <td>{r.members}</td>
              <td>{new Date(r.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className={styles.empty}>No tenants match.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
