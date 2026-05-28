import Link from "next/link";
import styles from "./audit.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id)));

  const [{ data: tenants }, usersResp] = await Promise.all([
    tenantIds.length > 0
      ? supabase.from("tenant").select("id, name").in("id", tenantIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    actorIds.length > 0
      ? createSupabaseAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 })
      : Promise.resolve({ data: { users: [] as { id: string; email: string | null }[] } }),
  ]);

  const tenantName = new Map((tenants ?? []).map((t) => [t.id, t.name]));
  const actorEmail = new Map((usersResp.data?.users ?? []).map((u) => [u.id, u.email ?? null]));

  const actions = ["", "create_tenant", "suspend_tenant", "unsuspend_tenant", "extend_trial", "change_plan", "soft_delete_tenant", "restore_tenant", "view_as", "exit_view_as", "add_member", "remove_member", "change_role"];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Audit log</h1>

      <div className={styles.filters}>
        <form>
          <label>
            Action
            <select name="action" defaultValue={actionFilter}>
              {actions.map((a) => <option key={a} value={a}>{a || "(all)"}</option>)}
            </select>
          </label>
          <label>
            Days
            <input type="number" name="days" min={1} max={365} defaultValue={days} />
          </label>
          <button type="submit">Apply</button>
        </form>
      </div>

      <table className={styles.table}>
        <thead>
          <tr><th>When</th><th>Actor</th><th>Action</th><th>Target tenant</th><th>Target user</th><th>Metadata</th></tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{actorEmail.get(r.actor_id) ?? r.actor_id.slice(0, 8)}</td>
              <td><span className={styles.actionPill}>{r.action}</span></td>
              <td>
                {r.target_tenant_id ? (
                  <Link href={`/app/super-admin/tenants/${r.target_tenant_id}`}>
                    {tenantName.get(r.target_tenant_id) ?? r.target_tenant_id.slice(0, 8)}
                  </Link>
                ) : "—"}
              </td>
              <td>{r.target_user_id ? r.target_user_id.slice(0, 8) : "—"}</td>
              <td><code className={styles.code}>{JSON.stringify(r.metadata)}</code></td>
            </tr>
          ))}
          {(rows ?? []).length === 0 && <tr><td colSpan={6} className={styles.empty}>No entries.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
