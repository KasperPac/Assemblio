import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import InviteForm from "./invite-form";
import TeamRowActions from "./team-row-actions";
import styles from "./team.module.css";

export default async function TeamPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();

  const { data: members } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("tenant_id", ctx.tenantId)
    .order("role", { ascending: false });

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Members, roles, and invitations."
      />
      <div className={styles.page}>
        <div className={styles.inviteRow}>
          <h2 className={styles.heading}>Invite a member</h2>
          <InviteForm />
        </div>

        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Role</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => (
              <tr key={member.id} className={styles.tr}>
                <td className={styles.td}>
                  {member.full_name ?? (
                    <span className={styles.muted}>No name set</span>
                  )}
                  {member.id === user?.id && (
                    <span className={styles.youBadge}> (you)</span>
                  )}
                </td>
                <td className={styles.td}>{member.role}</td>
                <td className={styles.td}>
                  <span
                    className={
                      member.status === "active"
                        ? styles.activeBadge
                        : styles.deactivatedBadge
                    }
                  >
                    {member.status}
                  </span>
                </td>
                <td className={styles.td}>
                  <TeamRowActions
                    profileId={member.id}
                    currentRole={member.role}
                    status={member.status}
                    isSelf={member.id === user?.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
