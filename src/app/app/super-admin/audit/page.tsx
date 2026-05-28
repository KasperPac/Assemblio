import Link from "next/link";
import styles from "./audit.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "../../_ui/page-header";

const ACTIONS = ["", "create_tenant", "suspend_tenant", "unsuspend_tenant", "extend_trial", "change_plan", "soft_delete_tenant", "restore_tenant", "view_as", "exit_view_as", "add_member", "remove_member", "change_role"];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; days?: string }>;
}) {
  const params = await searchParams;
  const days = Math.min(Math.max(parseInt(params.days ?? "30", 10) || 30, 1), 365);
  const actionFilter = params.action ?? "";

  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = supabase
    .from("super_admin_audit_log")
    .select("id, actor_id, action, target_tenant_id, target_user_id, metadata, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (actionFilter) query = query.eq("action", actionFilter);
  const { data: rows } = await query;

  const tenantIds = Array.from(new Set((rows ?? []).map((r) => r.target_tenant_id).filter(Boolean) as string[]));
  const userIdSet = new Set<string>((rows ?? []).map((r) => r.actor_id));
  for (const r of rows ?? []) {
    if (r.target_user_id) userIdSet.add(r.target_user_id);
  }
  const userIds = Array.from(userIdSet);

  const [{ data: tenants }, { data: emailRows }] = await Promise.all([
    tenantIds.length > 0
      ? supabase.from("tenant").select("id, name").in("id", tenantIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length > 0
      ? supabase.rpc("get_user_emails", { p_ids: userIds })
      : Promise.resolve({ data: [] as Array<{ id: string; email: string | null }> }),
  ]);

  const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  const userEmail = new Map(((emailRows ?? []) as Array<{ id: string; email: string | null }>).map((u) => [u.id, u.email]));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Audit log"
        description={`Super-admin actions across the platform — last ${days} day${days === 1 ? "" : "s"}.`}
      />

      <form className={styles.filters} method="get">
        <label>
          <span>Action</span>
          <select name="action" defaultValue={actionFilter}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a || "(all)"}</option>)}
          </select>
        </label>
        <label>
          <span>Days</span>
          <input type="number" name="days" min={1} max={365} defaultValue={days} />
        </label>
        <button type="submit" className={styles.applyButton}>Apply</button>
      </form>

      {(rows ?? []).length === 0 ? (
        <p className={styles.empty}>No entries.</p>
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Target tenant</th><th>Target user</th><th>Metadata</th></tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className={styles.meta}>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{userEmail.get(r.actor_id) ?? r.actor_id.slice(0, 8) + "…"}</td>
                  <td><span className={styles.actionPill}>{r.action}</span></td>
                  <td>
                    {r.target_tenant_id ? (
                      <Link href={`/app/super-admin/tenants/${r.target_tenant_id}`} className={styles.tenantLink}>
                        {tenantName.get(r.target_tenant_id) ?? r.target_tenant_id.slice(0, 8) + "…"}
                      </Link>
                    ) : <span className={styles.meta}>—</span>}
                  </td>
                  <td className={styles.meta}>
                    {r.target_user_id ? (userEmail.get(r.target_user_id) ?? r.target_user_id.slice(0, 8) + "…") : "—"}
                  </td>
                  <td><code className={styles.code}>{JSON.stringify(r.metadata)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
