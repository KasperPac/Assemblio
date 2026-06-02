import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import InviteForm from "./invite-form";
import TeamRowActions from "./team-row-actions";
import PendingInviteActions from "./pending-invite-actions";
import styles from "./team.module.css";

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

export default async function TeamPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();

  const admin = createSupabaseAdminClient();
  const [{ data: members }, { data: pending }] = await Promise.all([
    ctx.supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role, status")
      .eq("tenant_id", ctx.tenantId)
      .order("role", { ascending: false }),
    admin
      .from("tenant_invitation")
      .select("id, email, role, expires_at, created_at")
      .eq("tenant_id", ctx.tenantId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const pendingList = (pending ?? []) as PendingInvite[];

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Members, roles, and invitations."
      />
      <div className={styles.page}>
        <div className={styles.card}>
          <h2 className={styles.cardHeading}>Invite a member</h2>
          <InviteForm />
        </div>

        {pendingList.length > 0 ? (
          <div className={styles.card}>
            <h2 className={styles.cardHeading}>Pending invitations</h2>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Email</th>
                  <th className={styles.th}>Role</th>
                  <th className={styles.th}>Expires</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingList.map((inv) => {
                  const expires = new Date(inv.expires_at);
                  const expired = expires.getTime() < Date.now();
                  return (
                    <tr key={inv.id} className={styles.tr}>
                      <td className={styles.td}>{inv.email}</td>
                      <td className={styles.td}>{inv.role}</td>
                      <td className={styles.td}>
                        {expired ? (
                          <StatusBadge variant="warning">
                            Expired {expires.toLocaleDateString()}
                          </StatusBadge>
                        ) : (
                          <span className={styles.muted}>
                            {expires.toLocaleDateString()}
                          </span>
                        )}
                      </td>
                      <td className={styles.td}>
                        <PendingInviteActions invitationId={inv.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className={styles.card}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((member) => {
                const initial = (member.full_name?.trim()?.[0] ?? "?").toUpperCase();
                return (
                <tr key={member.id} className={styles.tr}>
                  <td className={styles.td}>
                    <span className={styles.memberCell}>
                      <span className={styles.memberAvatar}>
                        {member.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={member.avatar_url}
                            alt=""
                            className={styles.memberAvatarImage}
                          />
                        ) : (
                          initial
                        )}
                      </span>
                      <span>
                        {member.full_name ?? (
                          <span className={styles.muted}>No name set</span>
                        )}
                        {member.id === user?.id && (
                          <span className={styles.youBadge}> (you)</span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className={styles.td}>{member.role}</td>
                  <td className={styles.td}>
                    <StatusBadge variant={member.status === "active" ? "success" : "warning"}>
                      {member.status}
                    </StatusBadge>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
