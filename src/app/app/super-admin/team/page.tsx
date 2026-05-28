import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import TeamClient from "./_components/team-client";
import styles from "./team.module.css";

export default async function TeamPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app");
  const { supabase } = ctx;
  const canMutate = ctx.role === "super_admin";

  // Fetch all platform operator profiles
  const { data: platformProfiles } = await supabase
    .from("profiles")
    .select("id, role, super_admin_home_tenant_id")
    .in("role", ["super_admin", "platform_observer"]);

  const profileIds = (platformProfiles ?? []).map((p) => p.id);

  const emailById = new Map<string, string | null>();
  const lastSignInById = new Map<string, string | null>();

  if (profileIds.length > 0) {
    const { data: emailRows } = await supabase.rpc("get_user_emails", { p_ids: profileIds });
    for (const row of (emailRows ?? []) as Array<{ id: string; email: string | null; last_sign_in_at?: string | null }>) {
      emailById.set(row.id, row.email);
      if (row.last_sign_in_at !== undefined) {
        lastSignInById.set(row.id, row.last_sign_in_at ?? null);
      }
    }
  }

  const rows = (platformProfiles ?? []).map((p) => ({
    profileId: p.id,
    email: emailById.get(p.id) ?? null,
    role: p.role as "super_admin" | "platform_observer",
    lastSignIn: lastSignInById.get(p.id) ?? null,
    isSelf: p.id === ctx.userId,
  }));

  const superAdminCount = rows.filter((r) => r.role === "super_admin").length;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Platform team"
        description={`${rows.length} platform operator${rows.length !== 1 ? "s" : ""}`}
      />
      <TeamClient rows={rows} canMutate={canMutate} superAdminCount={superAdminCount} />
    </div>
  );
}
